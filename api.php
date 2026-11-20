<?php
// api.php - Sincronización en tiempo real entre el Android de Elias y el iPhone de Mónica
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

function estadoInicial() {
    return [
        'version' => 2,
        'usuarios' => [
            'elias' => null,
            'monica' => null
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
    return is_array($datos) ? $datos : estadoInicial();
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
    if (!in_array($userId, ['elias', 'monica'], true) || !is_array($datosUsuario)) {
        http_response_code(400);
        echo json_encode(['error' => 'Datos de usuario inválidos']);
        exit;
    }
    modificarStore(function (&$store) use ($userId, $datosUsuario) {
        $store['usuarios'][$userId] = $datosUsuario;
        return ['ok' => true, 'store' => $store];
    });
}

if ($accion === 'notify') {
    $de = $entrada['de'] ?? '';
    $para = $entrada['para'] ?? '';
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
            'leidaPor' => []
        ];
        array_unshift($store['notificaciones'], $nueva);
        // Mantener solo las últimas 30 notificaciones
        $store['notificaciones'] = array_slice($store['notificaciones'], 0, 30);
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
