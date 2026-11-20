<?php
// api.php - Sincronización en tiempo real entre Elias, Mónica y Mauro (Android & iOS)
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

date_default_timezone_set('Europe/Madrid');

const ARCHIVO = __DIR__ . '/data/store.json';
const USUARIOS_VALIDOS = ['elias', 'monica', 'mauro'];

function estadoInicial() {
    return [
        'version' => 3,
        'usuarios' => [
            'elias' => null,
            'monica' => null,
            'mauro' => null
        ],
        'pins' => [
            'elias' => '1234',
            'monica' => '1234',
            'mauro' => '1234'
        ],
        'notificaciones' => []
    ];
}

function leerStore() {
    if (!file_exists(ARCHIVO)) {
        if (!is_dir(dirname(ARCHIVO))) {
            @mkdir(dirname(ARCHIVO), 0775, true);
        }
        $ini = estadoInicial();
        @file_put_contents(ARCHIVO, json_encode($ini, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        return $ini;
    }
    $datos = json_decode(@file_get_contents(ARCHIVO), true);
    if (!is_array($datos)) {
        return estadoInicial();
    }
    // Asegurar que exista mauro y pins en stores anteriores
    if (!isset($datos['usuarios']) || !is_array($datos['usuarios'])) {
        $datos['usuarios'] = ['elias' => null, 'monica' => null, 'mauro' => null];
    } elseif (!array_key_exists('mauro', $datos['usuarios'])) {
        $datos['usuarios']['mauro'] = null;
    }
    if (!isset($datos['pins']) || !is_array($datos['pins'])) {
        $datos['pins'] = ['elias' => '1234', 'monica' => '1234', 'mauro' => '1234'];
    } else {
        foreach (USUARIOS_VALIDOS as $u) {
            if (empty($datos['pins'][$u])) {
                $datos['pins'][$u] = '1234';
            }
        }
    }
    return $datos;
}

function modificarStore(callable $cambio) {
    if (!is_dir(dirname(ARCHIVO))) {
        @mkdir(dirname(ARCHIVO), 0775, true);
    }
    $fp = fopen(ARCHIVO, 'c+');
    if (!$fp) {
        http_response_code(500);
        echo json_encode(['error' => 'No se puede abrir data/store.json']);
        exit;
    }
    flock($fp, LOCK_EX);
    $contenido = stream_get_contents($fp);
    $store = json_decode($contenido, true);
    if (!is_array($store)) {
        $store = estadoInicial();
    }
    if (!isset($store['usuarios']['mauro'])) {
        $store['usuarios']['mauro'] = $store['usuarios']['mauro'] ?? null;
    }
    if (!isset($store['pins']) || !is_array($store['pins'])) {
        $store['pins'] = ['elias' => '1234', 'monica' => '1234', 'mauro' => '1234'];
    }

    $res = $cambio($store);

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($store, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    echo json_encode($res, JSON_UNESCAPED_UNICODE);
    exit;
}

$accion = $_GET['action'] ?? 'load';

if ($accion === 'load') {
    echo json_encode(leerStore(), JSON_UNESCAPED_UNICODE);
    exit;
}

$entrada = json_decode(file_get_contents('php://input'), true) ?: [];

if ($accion === 'save_user') {
    $userId = $entrada['userId'] ?? '';
    $datosUsuario = $entrada['datos'] ?? null;
    if (!in_array($userId, USUARIOS_VALIDOS, true) || !is_array($datosUsuario)) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos de usuario inválidos']);
        exit;
    }
    modificarStore(function (&$store) use ($userId, $datosUsuario) {
        $store['usuarios'][$userId] = $datosUsuario;
        return ['ok' => true, 'store' => $store];
    });
}

if ($accion === 'change_pin') {
    $userId = $entrada['userId'] ?? '';
    $pinActual = trim((string)($entrada['pinActual'] ?? ''));
    $pinNuevo = trim((string)($entrada['pinNuevo'] ?? ''));

    if (!in_array($userId, USUARIOS_VALIDOS, true) || $pinNuevo === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Datos de contraseña inválidos']);
        exit;
    }

    modificarStore(function (&$store) use ($userId, $pinActual, $pinNuevo) {
        $pinGuardado = $store['pins'][$userId] ?? '1234';
        if ($pinActual !== $pinGuardado) {
            http_response_code(403);
            return ['ok' => false, 'error' => 'La contraseña actual no es correcta'];
        }
        $store['pins'][$userId] = $pinNuevo;
        return ['ok' => true, 'store' => $store];
    });
}

if ($accion === 'notify') {
    $de = $entrada['de'] ?? '';
    $para = $entrada['para'] ?? 'todos';
    $mensaje = trim((string)($entrada['mensaje'] ?? ''));
    $tipo = $entrada['tipo'] ?? 'completado';
    $fechaClave = $entrada['fechaClave'] ?? date('Y-m-d');

    if (!$de || !$mensaje) {
        http_response_code(400);
        echo json_encode(['error' => 'Faltan datos de notificación']);
        exit;
    }

    modificarStore(function (&$store) use ($de, $para, $mensaje, $tipo, $fechaClave) {
        if (!isset($store['notificaciones']) || !is_array($store['notificaciones'])) {
            $store['notificaciones'] = [];
        }
        $nueva = [
            'id' => uniqid('notif_'),
            'de' => $de,
            'para' => $para,
            'mensaje' => $mensaje,
            'tipo' => $tipo,
            'fechaClave' => $fechaClave,
            'hora' => date('d/m/Y H:i'),
            'timestamp' => time(),
            'leidaPor' => [$de]
        ];
        array_unshift($store['notificaciones'], $nueva);
        $store['notificaciones'] = array_slice($store['notificaciones'], 0, 40);
        return ['ok' => true, 'notificacion' => $nueva, 'store' => $store];
    });
}

if ($accion === 'mark_read') {
    $userId = $entrada['userId'] ?? '';
    modificarStore(function (&$store) use ($userId) {
        if (!empty($store['notificaciones'])) {
            foreach ($store['notificaciones'] as &$n) {
                if (!isset($n['leidaPor']) || !is_array($n['leidaPor'])) {
                    $n['leidaPor'] = [];
                }
                if (!in_array($userId, $n['leidaPor'], true)) {
                    $n['leidaPor'][] = $userId;
                }
            }
        }
        return ['ok' => true, 'store' => $store];
    });
}

http_response_code(400);
echo json_encode(['error' => 'Acción no reconocida']);
