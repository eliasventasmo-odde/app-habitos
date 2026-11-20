"""
Script de despliegue automático por FTP a Hostinger (public_html/habitos/).
Lee las credenciales de C:\Users\elias\.env (HOSTINGER_FTP_HOST, HOSTINGER_FTP_USER, HOSTINGER_FTP_PASS)
sin exponer nunca la contraseña en el chat.
"""
import os
import sys
import ftplib
import getpass
from pathlib import Path

ENV_PATH = Path.home() / ".env"
ORIGEN = Path(__file__).resolve().parent.parent / "SUBIR-A-HOSTINGER" / "habitos"


def cargar_env():
    datos = {}
    if ENV_PATH.exists():
        for linea in ENV_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
            linea = linea.strip()
            if linea and not linea.startswith("#") and "=" in linea:
                k, v = linea.split("=", 1)
                datos[k.strip()] = v.strip()
    return datos


def guardar_env(host, user, password):
    lineas = []
    if ENV_PATH.exists():
        for linea in ENV_PATH.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not any(linea.startswith(pref) for pref in ("HOSTINGER_FTP_HOST=", "HOSTINGER_FTP_USER=", "HOSTINGER_FTP_PASS=")):
                lineas.append(linea)
    lineas.append(f"HOSTINGER_FTP_HOST={host}")
    lineas.append(f"HOSTINGER_FTP_USER={user}")
    lineas.append(f"HOSTINGER_FTP_PASS={password}")
    ENV_PATH.write_text("\n".join(lineas) + "\n", encoding="utf-8")


def asegurar_directorio_ftp(ftp, ruta):
    partes = [p for p in ruta.split("/") if p]
    actual = ""
    for p in partes:
        actual = f"{actual}/{p}" if actual else p
        try:
            ftp.cwd(p)
        except ftplib.error_perm:
            try:
                ftp.mkd(p)
                ftp.cwd(p)
            except Exception as e:
                print(f"Aviso al entrar/crear {p}: {e}")


def subir():
    env = cargar_env()
    host = env.get("HOSTINGER_FTP_HOST", "").replace("ftp://", "").strip()
    user = env.get("HOSTINGER_FTP_USER", "u843202423").strip()
    password = env.get("HOSTINGER_FTP_PASS", "").strip()

    if not host or not password:
        print("Faltan credenciales FTP en ~/.env. Ejecuta primero CONFIGURAR-HOSTINGER.bat")
        sys.exit(1)

    print(f"Conectando a Hostinger FTP ({host}) con usuario {user}...")
    with ftplib.FTP(host, timeout=30) as ftp:
        ftp.login(user=user, passwd=password)
        ftp.encoding = "utf-8"
        print("Directorio inicial FTP:", ftp.pwd())

        # Comprobar si estamos dentro de public_html o un nivel arriba
        listado = ftp.nlst()
        if "public_html" in listado:
            ftp.cwd("public_html")
        elif "domains" in listado:
            ftp.cwd("domains/nietomonica.com/public_html")

        # Crear carpeta habitos y habitos/data
        try:
            ftp.mkd("habitos")
        except Exception:
            pass
        ftp.cwd("habitos")

        try:
            ftp.mkd("data")
        except Exception:
            pass

        # Subir archivos principales
        archivos_raiz = ["index.html", "styles.css", "app.js", "api.php", "manifest.json", "sw.js", "icon.svg"]
        for nombre in archivos_raiz:
            ruta_local = ORIGEN / nombre
            if ruta_local.exists():
                with open(ruta_local, "rb") as f:
                    ftp.storbinary(f"STOR {nombre}", f)
                print(f"  [OK] Subido: habitos/{nombre}")

        # Subir data/.htaccess y data/store.json (solo si store.json no existe aún en el servidor)
        ftp.cwd("data")
        archivos_remotos_data = ftp.nlst()

        htaccess_local = ORIGEN / "data" / ".htaccess"
        if htaccess_local.exists():
            with open(htaccess_local, "rb") as f:
                ftp.storbinary("STOR .htaccess", f)
            print("  [OK] Subido: habitos/data/.htaccess")

        store_local = ORIGEN / "data" / "store.json"
        if "store.json" not in archivos_remotos_data and store_local.exists():
            with open(store_local, "rb") as f:
                ftp.storbinary("STOR store.json", f)
            print("  [OK] Subido inicial: habitos/data/store.json")
        else:
            print("  [INFO] store.json ya existe en el servidor (se respeta sin sobrescribir).")

    print("\n¡DESPLIEGUE COMPLETADO CON ÉXITO!")
    print("URL pública: https://nietomonica.com/habitos/")


def configurar_interactivo():
    print("=" * 60)
    print("  CONFIGURACIÓN SEGURA DE ACCESO FTP A HOSTINGER")
    print("=" * 60)
    host = input("1. Pega el Host / IP de FTP (ej. ftp.nietomonica.com o 185.x.x.x): ").strip()
    if not host:
        host = "ftp.nietomonica.com"
    user = input("2. Usuario FTP [Enter para usar u843202423]: ").strip()
    if not user:
        user = "u843202423"
    password = getpass.getpass("3. Escribe tu Contraseña FTP (no se verá al escribir): ").strip()
    if not password:
        print("Error: la contraseña no puede estar vacía.")
        sys.exit(1)

    guardar_env(host, user, password)
    print("\n✅ Credenciales guardadas de forma segura en tu ordenador.")
    print("Probando subida automática a Hostinger ahora mismo...\n")
    subir()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--setup":
        configurar_interactivo()
    else:
        subir()
