"""
Servidor Wi-Fi Local para Registro de Hábitos Atómicos.
Permite abrir la app en el Android de Elias y en el iPhone de Mónica conectados al mismo Wi-Fi,
sincronizando los datos y las notificaciones entre ambos móviles en tiempo real (simulando api.php).
"""
import json
import sys
import time
import socket
import http.server
import socketserver
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
ARCHIVO = RAIZ / "data" / "store.json"


def obtener_ip_local():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def leer_store():
    if not ARCHIVO.exists():
        ARCHIVO.parent.mkdir(parents=True, exist_ok=True)
        ini = {"version": 2, "usuarios": {"elias": None, "monica": None}, "notificaciones": []}
        ARCHIVO.write_text(json.dumps(ini, ensure_ascii=False, indent=2), encoding="utf-8")
        return ini
    try:
        return json.loads(ARCHIVO.read_text(encoding="utf-8"))
    except Exception:
        return {"version": 2, "usuarios": {"elias": None, "monica": None}, "notificaciones": []}


def guardar_store(store):
    ARCHIVO.parent.mkdir(parents=True, exist_ok=True)
    ARCHIVO.write_text(json.dumps(store, ensure_ascii=False, indent=2), encoding="utf-8")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(RAIZ), **k)

    def _json(self, datos, codigo=200):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path.startswith("/api.php"):
            return self._json(leer_store())
        return super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api.php"):
            return self._json({"error": "No encontrado"}, 404)

        longitud = int(self.headers.get("Content-Length", 0))
        entrada = json.loads(self.rfile.read(longitud).decode("utf-8")) if longitud > 0 else {}
        accion = self.path.split("action=")[-1] if "action=" in self.path else ""
        store = leer_store()

        if accion == "save_user":
            user_id = entrada.get("userId", "")
            datos_usuario = entrada.get("datos")
            if user_id in ("elias", "monica") and isinstance(datos_usuario, dict):
                store.setdefault("usuarios", {})[user_id] = datos_usuario
                guardar_store(store)
                return self._json({"ok": True, "store": store})
            return self._json({"error": "Datos inválidos"}, 400)

        elif accion == "notify":
            nueva = {
                "id": f"notif_{int(time.time() * 1000)}",
                "de": entrada.get("de", ""),
                "para": entrada.get("para", ""),
                "mensaje": entrada.get("mensaje", ""),
                "tipo": entrada.get("tipo", "completado"),
                "fechaClave": entrada.get("fechaClave", datetime.now().strftime("%Y-%m-%d")),
                "hora": datetime.now().strftime("%d/%m/%Y %H:%M"),
                "timestamp": int(time.time()),
                "leidaPor": []
            }
            notifs = store.setdefault("notificaciones", [])
            notifs.insert(0, nueva)
            store["notificaciones"] = notifs[:30]
            guardar_store(store)
            return self._json({"ok": True, "notificacion": nueva, "store": store})

        elif accion == "mark_read":
            user_id = entrada.get("userId", "")
            for n in store.get("notificaciones", []):
                leida = n.setdefault("leidaPor", [])
                if user_id and user_id not in leida:
                    leida.append(user_id)
            guardar_store(store)
            return self._json({"ok": True, "store": store})

        return self._json({"error": "Acción desconocida"}, 400)


if __name__ == "__main__":
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ip = obtener_ip_local()
    print("=" * 65)
    print("  REGISTRO DE HÁBITOS ATÓMICOS - SERVIDOR PARA MÓVILES (ANDROID & iOS)")
    print("=" * 65)
    print(f"  1. En este PC abre:       http://127.0.0.1:{puerto}/index.html")
    print(f"  2. En tu ANDROID o iOS:   http://{ip}:{puerto}/index.html")
    print("     (Asegúrate de que ambos móviles estén en el mismo Wi-Fi)")
    print("=" * 65)
    print("  Deja esta ventana abierta para sincronizar notificaciones en vivo.")
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", puerto), Handler) as s:
        s.serve_forever()
