#!/usr/bin/env python3
"""
DC Motor Controller GUI v4
Interfaz grafica para motor DC con TB6612FNG (Canal B) + WS2812B POV
Tkinter + Matplotlib en tiempo real
Comunicacion serie con RP2040-Zero
Firmware v4.0 - Open Loop con Supervision y Telemetria
"""

import tkinter as tk
from tkinter import ttk, messagebox
import serial
import serial.tools.list_ports
import threading
import time
import re
from collections import deque

# Matplotlib
import matplotlib
matplotlib.use('TkAgg')
from matplotlib.figure import Figure
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

# ============ CONFIGURACION ============
BAUDRATE = 115200
HEARTBEAT_INTERVAL = 0.4  # segundos

# Cola thread-safe para mensajes del puerto serie
rx_queue = deque(maxlen=500)
queue_lock = threading.Lock()

# Nombres de patrones POV (deben coincidir con el firmware)
PATTERN_NAMES = {
    0: "Arcoiris",
    1: "Anillos",
    2: "Aspas",
    3: "Espiral",
    255: "Solido",
}


# ============ PARSER TELEMETRIA ============
# Campos nuevos al FINAL para backward compatibility con parsers viejos
TEL_PATTERN = re.compile(
    r'TEL\s+'
    r'state=(\S+)\s+'
    r'rpm_target=([\d.]+)\s+'
    r'rpm_real=([\d.]+)\s+'
    r'desfase=([\d.-]+)\s+'
    r'volt=([\d.]+)\s+'
    r'duty=([\d.]+)\s+'
    r'hall_dt=(\d+)\s+'
    r'ramp_rate=([\d.]+)'
    r'(?:\s+pattern=(\d+))?'
    r'(?:\s+pov_sector=(\d+))?'
    r'(?:\s+led_count=(\d+))?'
)


def parse_telemetry(line):
    match = TEL_PATTERN.match(line.strip())
    if not match:
        return None
    tel = {
        'state': match.group(1),
        'rpm_target': float(match.group(2)),
        'rpm_real': float(match.group(3)),
        'desfase': float(match.group(4)),
        'volt': float(match.group(5)),
        'duty': float(match.group(6)),
        'hall_dt_us': int(match.group(7)),
        'ramp_rate': float(match.group(8)),
        'pattern': int(match.group(9)) if match.group(9) is not None else None,
        'pov_sector': int(match.group(10)) if match.group(10) is not None else None,
        'led_count': int(match.group(11)) if match.group(11) is not None else None,
    }
    return tel


# ============ APLICACION PRINCIPAL ============

class DCMotorControllerGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("DC Motor Controller v4 - TB6612FNG + WS2812B POV")
        self.geometry("1200x900")
        self.minsize(1000, 750)

        # Puerto serie
        self.serial_port = None
        self.connected = False
        self.running = True

        # Threads
        self.reader_thread = None
        self.hb_thread = None

        # Datos para grafico
        self.max_points = 200
        self.time_data = deque(maxlen=self.max_points)
        self.target_data = deque(maxlen=self.max_points)
        self.real_data = deque(maxlen=self.max_points)
        self.t_counter = 0

        # Ultima telemetria
        self.last_tel = None

        self._build_ui()
        self._refresh_ports()
        self.after(50, self._update_gui)

    # ---------- CONSTRUCCION UI ----------
    def _build_ui(self):
        # === Frame superior: Conexion ===
        conn_frame = ttk.LabelFrame(self, text="Conexion Serie", padding=10)
        conn_frame.pack(fill=tk.X, padx=10, pady=5)

        ttk.Label(conn_frame, text="Puerto:").grid(row=0, column=0, sticky=tk.W)
        self.port_combo = ttk.Combobox(conn_frame, width=30, state="readonly")
        self.port_combo.grid(row=0, column=1, padx=5)

        ttk.Button(conn_frame, text="Refrescar", command=self._refresh_ports).grid(row=0, column=2, padx=5)
        self.btn_connect = ttk.Button(conn_frame, text="Conectar", command=self._toggle_connect)
        self.btn_connect.grid(row=0, column=3, padx=5)

        self.conn_status = tk.Label(conn_frame, text="Desconectado", fg="red", font=("Arial", 10, "bold"))
        self.conn_status.grid(row=0, column=4, padx=20)

        ttk.Button(conn_frame, text="HELP", command=lambda: self._send_cmd("HELP")).grid(row=0, column=5, padx=5)
        ttk.Button(conn_frame, text="STATUS", command=lambda: self._send_cmd("STATUS")).grid(row=0, column=6, padx=5)

        # === Frame central: izquierda controles, derecha telemetria ===
        mid_frame = ttk.Frame(self)
        mid_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        # -- Controles (izquierda) --
        ctrl_frame = ttk.LabelFrame(mid_frame, text="Controles", padding=10)
        ctrl_frame.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 5))

        # Botones principales
        btn_frame = ttk.Frame(ctrl_frame)
        btn_frame.pack(fill=tk.X, pady=5)
        ttk.Button(btn_frame, text="START", command=self._on_start).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="STOP", command=lambda: self._send_cmd("STOP")).pack(side=tk.LEFT, padx=2)
        ttk.Button(btn_frame, text="RESET", command=lambda: self._send_cmd("RESET")).pack(side=tk.LEFT, padx=2)

        # RPM con boton Aplicar
        ttk.Label(ctrl_frame, text="RPM Objetivo:").pack(anchor=tk.W, pady=(10, 0))
        self.rpm_var = tk.IntVar(value=500)
        self.rpm_slider = ttk.Scale(ctrl_frame, from_=0, to=4000, orient=tk.HORIZONTAL,
                                     variable=self.rpm_var, command=self._on_rpm_slide)
        self.rpm_slider.pack(fill=tk.X)
        rpm_apply_frame = ttk.Frame(ctrl_frame)
        rpm_apply_frame.pack(fill=tk.X)
        self.rpm_label = ttk.Label(rpm_apply_frame, text="500 RPM")
        self.rpm_label.pack(side=tk.LEFT)
        ttk.Button(rpm_apply_frame, text="Aplicar RPM", command=self._apply_rpm).pack(side=tk.RIGHT)

        # Voltaje con boton Aplicar
        ttk.Label(ctrl_frame, text="Voltaje Efectivo (V):").pack(anchor=tk.W, pady=(10, 0))
        self.volt_var = tk.DoubleVar(value=9.0)
        self.volt_slider = ttk.Scale(ctrl_frame, from_=0.0, to=12.0, orient=tk.HORIZONTAL,
                                      variable=self.volt_var, command=self._on_volt_slide)
        self.volt_slider.pack(fill=tk.X)
        volt_apply_frame = ttk.Frame(ctrl_frame)
        volt_apply_frame.pack(fill=tk.X)
        self.volt_label = ttk.Label(volt_apply_frame, text="9.0 V")
        self.volt_label.pack(side=tk.LEFT)
        ttk.Button(volt_apply_frame, text="Aplicar Volt", command=self._apply_volt).pack(side=tk.RIGHT)

        # Ramp Rate con boton Aplicar
        ttk.Label(ctrl_frame, text="Rampa (RPM/s):").pack(anchor=tk.W, pady=(10, 0))
        self.ramp_var = tk.IntVar(value=300)
        self.ramp_slider = ttk.Scale(ctrl_frame, from_=10, to=2000, orient=tk.HORIZONTAL,
                                      variable=self.ramp_var, command=self._on_ramp_slide)
        self.ramp_slider.pack(fill=tk.X)
        ramp_apply_frame = ttk.Frame(ctrl_frame)
        ramp_apply_frame.pack(fill=tk.X)
        self.ramp_label = ttk.Label(ramp_apply_frame, text="300 RPM/s")
        self.ramp_label.pack(side=tk.LEFT)
        ttk.Button(ramp_apply_frame, text="Aplicar Ramp", command=self._apply_ramp).pack(side=tk.RIGHT)

        # Direccion
        ttk.Label(ctrl_frame, text="Direccion:").pack(anchor=tk.W, pady=(10, 0))
        self.dir_var = tk.StringVar(value="CW")
        dir_frame = ttk.Frame(ctrl_frame)
        dir_frame.pack(fill=tk.X)
        ttk.Radiobutton(dir_frame, text="CW", variable=self.dir_var, value="CW").pack(side=tk.LEFT, padx=5)
        ttk.Radiobutton(dir_frame, text="CCW", variable=self.dir_var, value="CCW").pack(side=tk.LEFT, padx=5)
        ttk.Button(dir_frame, text="Aplicar", command=self._on_dir).pack(side=tk.RIGHT, padx=5)

        # ============ LEDs WS2812B ============
        ttk.Separator(ctrl_frame, orient=tk.HORIZONTAL).pack(fill=tk.X, pady=15)
        ttk.Label(ctrl_frame, text="LEDs WS2812B POV", font=("Arial", 10, "bold")).pack(anchor=tk.W)

        # ON/OFF
        led_btn_frame = ttk.Frame(ctrl_frame)
        led_btn_frame.pack(fill=tk.X, pady=5)
        ttk.Button(led_btn_frame, text="ON", command=lambda: self._send_cmd("LEDS ON")).pack(side=tk.LEFT, padx=2)
        ttk.Button(led_btn_frame, text="OFF", command=lambda: self._send_cmd("LEDS OFF")).pack(side=tk.LEFT, padx=2)

        # Velocidad LED (drift arcoiris)
        ttk.Label(ctrl_frame, text="Velocidad LED (drift):").pack(anchor=tk.W, pady=(5, 0))
        self.ledspeed_var = tk.IntVar(value=128)
        self.ledspeed_slider = ttk.Scale(ctrl_frame, from_=0, to=255, orient=tk.HORIZONTAL,
                                          variable=self.ledspeed_var, command=self._on_ledspeed_slide)
        self.ledspeed_slider.pack(fill=tk.X)
        ledspeed_apply_frame = ttk.Frame(ctrl_frame)
        ledspeed_apply_frame.pack(fill=tk.X)
        self.ledspeed_label = ttk.Label(ledspeed_apply_frame, text="128")
        self.ledspeed_label.pack(side=tk.LEFT)
        ttk.Button(ledspeed_apply_frame, text="Aplicar LEDSpeed", command=self._apply_ledspeed).pack(side=tk.RIGHT)

        # Patron POV
        ttk.Label(ctrl_frame, text="Patron POV:").pack(anchor=tk.W, pady=(10, 0))
        self.pattern_var = tk.IntVar(value=0)
        pattern_frame = ttk.Frame(ctrl_frame)
        pattern_frame.pack(fill=tk.X)
        self.pattern_combo = ttk.Combobox(pattern_frame, values=["0: Arcoiris", "1: Anillos", "2: Aspas", "3: Espiral"],
                                           state="readonly", width=16)
        self.pattern_combo.set("0: Arcoiris")
        self.pattern_combo.pack(side=tk.LEFT, padx=2)
        self.pattern_combo.bind("<<ComboboxSelected>>", self._on_pattern_select)
        ttk.Button(pattern_frame, text="Aplicar", command=self._apply_pattern).pack(side=tk.RIGHT, padx=2)

        # Color solido (LEDCOLOR) - para prueba de cableado / modo solido
        ttk.Label(ctrl_frame, text="Color Solido (R,G,B):").pack(anchor=tk.W, pady=(10, 0))
        color_frame = ttk.Frame(ctrl_frame)
        color_frame.pack(fill=tk.X)

        self.led_r_var = tk.IntVar(value=0)
        self.led_g_var = tk.IntVar(value=200)
        self.led_b_var = tk.IntVar(value=255)

        ttk.Label(color_frame, text="R:").pack(side=tk.LEFT)
        ttk.Spinbox(color_frame, from_=0, to=255, width=5, textvariable=self.led_r_var).pack(side=tk.LEFT, padx=2)
        ttk.Label(color_frame, text="G:").pack(side=tk.LEFT)
        ttk.Spinbox(color_frame, from_=0, to=255, width=5, textvariable=self.led_g_var).pack(side=tk.LEFT, padx=2)
        ttk.Label(color_frame, text="B:").pack(side=tk.LEFT)
        ttk.Spinbox(color_frame, from_=0, to=255, width=5, textvariable=self.led_b_var).pack(side=tk.LEFT, padx=2)
        ttk.Button(color_frame, text="Aplicar", command=self._apply_ledcolor).pack(side=tk.RIGHT, padx=2)

        # Cantidad de LEDs
        ttk.Label(ctrl_frame, text="Cantidad LEDs:").pack(anchor=tk.W, pady=(10, 0))
        ledcount_frame = ttk.Frame(ctrl_frame)
        ledcount_frame.pack(fill=tk.X)
        self.ledcount_var = tk.IntVar(value=97)
        ttk.Spinbox(ledcount_frame, from_=1, to=100, width=6, textvariable=self.ledcount_var).pack(side=tk.LEFT, padx=2)
        ttk.Button(ledcount_frame, text="Aplicar LEDCOUNT", command=self._apply_ledcount).pack(side=tk.RIGHT, padx=2)

        # -- Telemetria (derecha) --
        tel_frame = ttk.LabelFrame(mid_frame, text="Telemetria en Vivo", padding=10)
        tel_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))

        # Indicador de estado grande
        self.state_indicator = tk.Label(tel_frame, text="IDLE", font=("Arial", 24, "bold"),
                                         bg="gray", fg="white", width=10, height=2)
        self.state_indicator.pack(fill=tk.X, pady=5)

        # Grid de valores
        self.tel_labels = {}
        tel_grid = ttk.Frame(tel_frame)
        tel_grid.pack(fill=tk.X, pady=5)

        fields = [
            ("rpm_target", "RPM Target", "0.0"),
            ("rpm_real", "RPM Real", "0.0"),
            ("desfase", "Desfase", "0.0"),
            ("volt", "Voltaje", "0.0"),
            ("duty", "Duty %", "0.0"),
            ("hall_dt", "Hall dt (us)", "0"),
            ("ramp_rate", "Ramp Rate", "0.0"),
            ("pattern", "Patron LED", "-"),
            ("pov_sector", "POV Sector", "-"),
            ("led_count", "LED Count", "-"),
        ]

        for i, (key, name, default) in enumerate(fields):
            row = i // 2
            col = (i % 2) * 2
            ttk.Label(tel_grid, text=f"{name}:", font=("Arial", 9, "bold")).grid(row=row, column=col, sticky=tk.W, padx=5, pady=3)
            lbl = ttk.Label(tel_grid, text=default, font=("Arial", 9))
            lbl.grid(row=row, column=col+1, sticky=tk.W, padx=5, pady=3)
            self.tel_labels[key] = lbl

        # Log
        ttk.Label(tel_frame, text="Log:", font=("Arial", 9, "bold")).pack(anchor=tk.W, pady=(10, 0))
        log_frame = ttk.Frame(tel_frame)
        log_frame.pack(fill=tk.BOTH, expand=True, pady=5)

        self.log_text = tk.Text(log_frame, height=6, wrap=tk.WORD, state=tk.DISABLED, font=("Consolas", 8))
        self.log_text.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        log_scroll = ttk.Scrollbar(log_frame, command=self.log_text.yview)
        log_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        self.log_text.config(yscrollcommand=log_scroll.set)

        # === Frame inferior: Grafico ===
        graph_frame = ttk.LabelFrame(self, text="RPM en Tiempo Real", padding=5)
        graph_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=5)

        self.fig = Figure(figsize=(8, 3), dpi=100)
        self.ax = self.fig.add_subplot(111)
        self.ax.set_xlabel("Tiempo (muestras)")
        self.ax.set_ylabel("RPM")
        self.ax.set_ylim(0, 4500)
        self.ax.grid(True, alpha=0.3)

        self.line_target, = self.ax.plot([], [], 'b-', label='Target', linewidth=1.5)
        self.line_real, = self.ax.plot([], [], 'r-', label='Real', linewidth=1.5)
        self.ax.legend(loc='upper right')

        self.canvas = FigureCanvasTkAgg(self.fig, master=graph_frame)
        self.canvas.get_tk_widget().pack(fill=tk.BOTH, expand=True)

    # ---------- CALLBACKS UI ----------
    def _on_start(self):
        rpm = self.rpm_var.get()
        self._send_cmd(f"START {rpm}")

    def _apply_rpm(self):
        rpm = self.rpm_var.get()
        self._send_cmd(f"START {rpm}")

    def _apply_volt(self):
        v = self.volt_var.get()
        self._send_cmd(f"VOLT {v:.1f}")

    def _apply_ramp(self):
        r = self.ramp_var.get()
        self._send_cmd(f"RAMP {r}")

    def _apply_ledspeed(self):
        s = self.ledspeed_var.get()
        self._send_cmd(f"LEDSPEED {s}")

    def _on_pattern_select(self, event=None):
        # Extrae el numero del patron del texto seleccionado
        selected = self.pattern_combo.get()
        try:
            pat_num = int(selected.split(":")[0])
            self.pattern_var.set(pat_num)
        except (ValueError, IndexError):
            pass

    def _apply_pattern(self):
        pat = self.pattern_var.get()
        self._send_cmd(f"PATTERN {pat}")

    def _apply_ledcolor(self):
        r = self.led_r_var.get()
        g = self.led_g_var.get()
        b = self.led_b_var.get()
        self._send_cmd(f"LEDCOLOR {r} {g} {b}")

    def _apply_ledcount(self):
        n = self.ledcount_var.get()
        self._send_cmd(f"LEDCOUNT {n}")

    def _on_rpm_slide(self, val):
        self.rpm_label.config(text=f"{int(float(val))} RPM")

    def _on_volt_slide(self, val):
        self.volt_label.config(text=f"{float(val):.1f} V")

    def _on_ramp_slide(self, val):
        self.ramp_label.config(text=f"{int(float(val))} RPM/s")

    def _on_ledspeed_slide(self, val):
        self.ledspeed_label.config(text=str(int(float(val))))

    def _on_dir(self):
        d = self.dir_var.get()
        self._send_cmd(f"DIR {d}")

    # ---------- CONEXION SERIE ----------
    def _refresh_ports(self):
        ports = serial.tools.list_ports.comports()
        names = [p.device for p in ports]
        self.port_combo['values'] = names
        if names and not self.port_combo.get():
            self.port_combo.set(names[0])

    def _toggle_connect(self):
        if self.connected:
            self._disconnect()
        else:
            self._connect()

    def _connect(self):
        port = self.port_combo.get()
        if not port:
            messagebox.showwarning("Sin puerto", "Selecciona un puerto COM primero.")
            return
        try:
            self.serial_port = serial.Serial(port, BAUDRATE, timeout=0.05)
            time.sleep(2)
            self.connected = True
            self.conn_status.config(text=f"Conectado ({port})", fg="green")
            self.btn_connect.config(text="Desconectar")

            self.reader_thread = threading.Thread(target=self._reader_loop, daemon=True)
            self.hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
            self.reader_thread.start()
            self.hb_thread.start()

            self._log(f"Conectado a {port}")
            self._send_cmd("STATUS")
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo conectar:\n{e}")

    def _disconnect(self):
        self.connected = False
        self.running = False
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
        self.conn_status.config(text="Desconectado", fg="red")
        self.btn_connect.config(text="Conectar")
        self._log("Desconectado")
        self.running = True

    def _send_cmd(self, cmd):
        if self.connected and self.serial_port and self.serial_port.is_open:
            try:
                self.serial_port.write(f"{cmd}\n".encode())
                self._log(f">>> {cmd}")
            except Exception as e:
                self._log(f"ERR TX: {e}")
        else:
            self._log(f"[offline] {cmd}")

    # ---------- THREADS ----------
    def _reader_loop(self):
        while self.connected and self.serial_port and self.serial_port.is_open:
            try:
                line = self.serial_port.readline().decode('utf-8', errors='ignore').strip()
                if line:
                    with queue_lock:
                        rx_queue.append(line)
            except Exception:
                break

    def _heartbeat_loop(self):
        while self.connected:
            self._send_cmd("HBT")
            time.sleep(HEARTBEAT_INTERVAL)

    # ---------- ACTUALIZACION GUI ----------
    def _update_gui(self):
        with queue_lock:
            lines = list(rx_queue)
            rx_queue.clear()

        for line in lines:
            self._process_line(line)

        self.after(50, self._update_gui)

    def _process_line(self, line):
        tel = parse_telemetry(line)
        if tel:
            self.last_tel = tel
            self._update_telemetry(tel)
            self._update_graph(tel)
            return
        self._log(f"<<< {line}")

    def _update_telemetry(self, tel):
        self.tel_labels['rpm_target'].config(text=f"{tel['rpm_target']:.1f}")
        self.tel_labels['rpm_real'].config(text=f"{tel['rpm_real']:.1f}")
        self.tel_labels['desfase'].config(text=f"{tel['desfase']:+.1f}")
        self.tel_labels['volt'].config(text=f"{tel['volt']:.1f} V")
        self.tel_labels['duty'].config(text=f"{tel['duty']:.1f}%")
        self.tel_labels['hall_dt'].config(text=f"{tel['hall_dt_us']}")
        self.tel_labels['ramp_rate'].config(text=f"{tel['ramp_rate']:.1f}")

        # Campos opcionales (pueden ser None si el firmware es viejo)
        if tel['pattern'] is not None:
            pat_name = PATTERN_NAMES.get(tel['pattern'], f"#{tel['pattern']}")
            self.tel_labels['pattern'].config(text=f"{pat_name} ({tel['pattern']})")
        if tel['pov_sector'] is not None:
            self.tel_labels['pov_sector'].config(text=f"{tel['pov_sector']}")
        if tel['led_count'] is not None:
            self.tel_labels['led_count'].config(text=f"{tel['led_count']}")

        state = tel['state']
        colors = {
            'IDLE': ('gray', 'white'),
            'RAMP_UP': ('orange', 'black'),
            'RUNNING': ('green', 'white'),
            'RAMP_DOWN': ('orange', 'black'),
            'COAST': ('blue', 'white'),
            'FAULT': ('red', 'white'),
        }
        bg, fg = colors.get(state, ('gray', 'white'))
        self.state_indicator.config(text=state, bg=bg, fg=fg)

        if abs(tel['desfase']) > 50:
            self.tel_labels['desfase'].config(foreground='red')
        elif abs(tel['desfase']) > 20:
            self.tel_labels['desfase'].config(foreground='orange')
        else:
            self.tel_labels['desfase'].config(foreground='green')

    def _update_graph(self, tel):
        self.time_data.append(self.t_counter)
        self.target_data.append(tel['rpm_target'])
        self.real_data.append(tel['rpm_real'])
        self.t_counter += 1

        self.line_target.set_data(list(self.time_data), list(self.target_data))
        self.line_real.set_data(list(self.time_data), list(self.real_data))

        if self.time_data:
            self.ax.set_xlim(max(0, self.t_counter - self.max_points), self.t_counter + 10)

        self.fig.canvas.draw_idle()

    def _log(self, msg):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {msg}\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)

    def on_closing(self):
        self._disconnect()
        self.destroy()


# ============ MAIN ============

if __name__ == '__main__':
    app = DCMotorControllerGUI()
    app.protocol("WM_DELETE_WINDOW", app.on_closing)
    app.mainloop()