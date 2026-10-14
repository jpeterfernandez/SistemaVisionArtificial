
from ultralytics import YOLO
import cv2
import threading
import time

# =====================================================
# CONFIGURACION
# =====================================================

MODEL_PATH = "best.pt"

# Camara local de la laptop: se conserva el indice 2
CAMERA_LOCAL_INDEX = 2

# Cambia esta URL por la direccion REAL de IP Webcam
CAMERA_IP_URL = "http://192.168.100.44:8080/video"

CONFIDENCE_THRESHOLD = 0.50
IMAGE_SIZE = 416

# Resolucion solicitada para la camara local
LOCAL_WIDTH = 640
LOCAL_HEIGHT = 480

# =====================================================
# CARGAR MODELO YOLO
# =====================================================

print("Cargando modelo YOLO...")

model = YOLO(MODEL_PATH)

print("Modelo cargado correctamente.")

# =====================================================
# ESTADO DE LAS CAMARAS
# =====================================================
"""
Administrar camaras
cameras = {
    "Web Cam local - Indice 2": {
        "source": CAMERA_LOCAL_INDEX,
        "cap": None,
        "latest_frame": None,
        "frame_id": 0,
        "last_processed_id": -1,
        "detections": [],
        "inference_ms": 0.0,
        "connected": False,
        "error": None,
    },
    "Camara IP - Celular": {
        "source": CAMERA_IP_URL,
        "cap": None,
        "latest_frame": None,
        "frame_id": 0,
        "last_processed_id": -1,
        "detections": [],
        "inference_ms": 0.0,
        "connected": False,
        "error": None,
    },
}
"""
cameras = {
    "Camara IP - Celular": {
        "source": CAMERA_IP_URL,
        "cap": None,
        "latest_frame": None,
        "frame_id": 0,
        "last_processed_id": -1,
        "detections": [],
        "inference_ms": 0.0,
        "connected": False,
        "error": None,
    },
}
lock = threading.Lock()
stop_event = threading.Event()

# =====================================================
# ABRIR CAMARAS
# =====================================================

def open_cameras():
    for name, state in cameras.items():
        source = state["source"]

        print(f"\nAbriendo: {name}")

        # CAP_FFMPEG puede ayudar con algunas transmisiones IP.
        # Si no funciona en tu sistema, se usa la apertura normal.
        if isinstance(source, str):
            cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)

            if not cap.isOpened():
                cap.release()
                cap = cv2.VideoCapture(source)
        else:
            cap = cv2.VideoCapture(source)

        if not cap.isOpened():
            print(f"ERROR: No se pudo abrir {name}.")
            cap.release()
            continue

        if isinstance(source, int):
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, LOCAL_WIDTH)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, LOCAL_HEIGHT)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        with lock:
            state["cap"] = cap
            state["connected"] = True
            state["error"] = None

        print(f"Camara abierta: {name}")

# =====================================================
# HILO DE CAPTURA PARA CADA CAMARA
# =====================================================

def capture_loop(name):
    state = cameras[name]
    cap = state["cap"]

    if cap is None:
        return

    failures = 0

    while not stop_event.is_set():
        ret, frame = cap.read()

        if not ret or frame is None:
            failures += 1

            if failures >= 30:
                with lock:
                    state["connected"] = False
                    state["error"] = "Sin imagen de la camara"

            time.sleep(0.05)
            continue

        failures = 0

        with lock:
            state["latest_frame"] = frame
            state["frame_id"] += 1
            state["connected"] = True
            state["error"] = None

# =====================================================
# HILO DE INFERENCIA YOLO
# =====================================================

def inference_loop():
    # Un solo hilo usa el modelo compartido.
    # Evita ejecutar predict simultaneamente sobre el mismo modelo.

    while not stop_event.is_set():

        processed_any = False

        for name, state in cameras.items():

            with lock:
                if state["latest_frame"] is None:
                    continue

                if state["frame_id"] == state["last_processed_id"]:
                    continue

                frame = state["latest_frame"].copy()
                current_id = state["frame_id"]

                state["last_processed_id"] = current_id

            processed_any = True
            start = time.perf_counter()

            try:
                result = model.predict(
                    source=frame,
                    imgsz=IMAGE_SIZE,
                    conf=CONFIDENCE_THRESHOLD,
                    verbose=False
                )[0]

                elapsed = (
                    time.perf_counter() - start
                ) * 1000

                new_detections = []

                if result.boxes is not None:
                    for box in result.boxes:

                        confidence = float(box.conf[0])

                        class_id = int(box.cls[0])
                        class_name = model.names[class_id]

                        display_name = class_name.replace(
                            "chasis_", ""
                        )

                        x1, y1, x2, y2 = map(
                            int, box.xyxy[0].tolist()
                        )

                        label = (
                            f"{display_name} "

                        )

                        new_detections.append(
                            (x1, y1, x2, y2, label)
                        )

                with lock:
                    state["detections"] = new_detections
                    state["inference_ms"] = elapsed

            except Exception as error:
                print(f"Error YOLO en {name}: {error}")
                time.sleep(0.05)

        if not processed_any:
            time.sleep(0.003)

# =====================================================
# DIBUJAR RESULTADOS
# =====================================================

def draw_overlay(frame, name, detections, inference_ms, connected):

    for x1, y1, x2, y2, label in detections:

        cv2.rectangle(
            frame,
            (x1, y1),
            (x2, y2),
            (0, 255, 0),
            2
        )

        font = cv2.FONT_HERSHEY_SIMPLEX
        font_scale = 0.65
        thickness = 2

        (tw, th), baseline = cv2.getTextSize(
            label, font, font_scale, thickness
        )

        text_y = max(y1, th + baseline + 8)

        cv2.rectangle(
            frame,
            (x1, text_y - th - baseline - 8),
            (x1 + tw + 8, text_y),
            (0, 255, 0),
            -1
        )

        cv2.putText(
            frame,
            label,
            (x1 + 4, text_y - 5),
            font,
            font_scale,
            (0, 0, 0),
            thickness,
            cv2.LINE_AA
        )

    status = "Live" if connected else "SIN SENAL"

    # Encabezado 1: Estado de la cámara
    cv2.putText(
        frame,
        f"{name} | {status}",
        (15, 28),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 255, 255) if connected else (0, 0, 255),
        2,
        cv2.LINE_AA
    )

    # Encabezado 2: Tiempo de inferencia YOLO
    cv2.putText(
        frame,
        f"YOLO: {inference_ms:.0f} ms",
        (15, 58),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 255, 255),
        2,
        cv2.LINE_AA
    )

    # Encabezado 3: Contador de detecciones en pantalla
    num_detections = len(detections)
    cv2.putText(
        frame,
        f"Detecciones: {num_detections}",
        (15, 88),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (0, 255, 255),
        2,
        cv2.LINE_AA
    )

    return frame

# =====================================================
# PROGRAMA PRINCIPAL
# =====================================================

capture_threads = []
inference_thread = None

try:
    open_cameras()

    available = [
        name for name, state in cameras.items()
        if state["cap"] is not None
    ]

    if not available:
        raise RuntimeError(
            "No se pudo abrir ninguna camara. "
            "Verifica el indice local y la URL IP."
        )

    for name in available:
        thread = threading.Thread(
            target=capture_loop,
            args=(name,),
            daemon=True
        )
        thread.start()
        capture_threads.append(thread)

    inference_thread = threading.Thread(
        target=inference_loop,
        daemon=True
    )
    inference_thread.start()

    # Una ventana independiente por camara
    for name in available:
        cv2.namedWindow(name, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(name, 960, 600)

    print("\nDeteccion iniciada.")
    print("Presiona Q o ESC para salir.")

    while True:

        for name in available:

            with lock:
                frame = cameras[name]["latest_frame"]
                detections = cameras[name]["detections"].copy()
                inference_ms = cameras[name]["inference_ms"]
                connected = cameras[name]["connected"]

                if frame is not None:
                    frame = frame.copy()

            if frame is None:
                continue

            frame = draw_overlay(
                frame,
                name,
                detections,
                inference_ms,
                connected
            )

            cv2.imshow(name, frame)

        key = cv2.waitKey(1) & 0xFF

        if key == ord("q") or key == 27:
            break

finally:
    print("\nCerrando camaras y procesos...")

    stop_event.set()

    for thread in capture_threads:
        thread.join(timeout=2)

    if inference_thread is not None:
        inference_thread.join(timeout=2)

    for state in cameras.values():
        cap = state["cap"]

        if cap is not None:
            cap.release()

    cv2.destroyAllWindows()

    print("Programa finalizado.")