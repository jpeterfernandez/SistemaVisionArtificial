from typing import List, Optional
from datetime import datetime, timedelta, timezone
import os
import sys
import time
import threading
from queue import Empty, Full, Queue
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import jwt
import cv2
import numpy as np

from app.db.session import get_db
from app.db.session import SessionLocal
from app.db.models.user import User
from app.db.models.camera import Camera
from app.api.dependencies import get_current_user, require_role
from app.core.config import settings
from app.schemas.camera import CameraResponse, CameraCreate, CameraUpdate
from app.repositories.camera_repository import CameraRepository
from app.repositories.user_repository import UserRepository
from app.repositories.audit_repository import record_audit
from app.core.exceptions import NotFoundException, UnauthorizedException, ForbiddenException
from app.core.security import decode_access_token
from app.core.zones import allowed_zones_for_user, user_can_access_zone
from app.services.yolo_service import yolo_service
from app.services.camera_monitor import mark_stream_started, mark_stream_stopped

router = APIRouter(prefix="/cameras", tags=["Cámaras y Zonas de Producción"])


def camera_response_for_user(camera: Camera, user: User) -> CameraResponse:
    response = CameraResponse.model_validate(camera)
    if user.role.upper() != "ADMIN":
        response.source = "Fuente protegida"
    return response


class LatestFrameReader:
    """Reads camera frames in the background and keeps only the newest one."""

    def __init__(self, cap: cv2.VideoCapture, first_frame):
        self.cap = cap
        self.frames: Queue = Queue(maxsize=1)
        self.stop_event = threading.Event()
        self.finished_event = threading.Event()
        self.thread = threading.Thread(target=self._capture_frames, daemon=True)
        self._publish(first_frame)

    @property
    def finished(self) -> bool:
        return self.finished_event.is_set()

    def _publish(self, frame) -> None:
        try:
            self.frames.put_nowait(frame)
        except Full:
            try:
                self.frames.get_nowait()
            except Empty:
                pass
            try:
                self.frames.put_nowait(frame)
            except Full:
                pass

    def _capture_frames(self) -> None:
        consecutive_failures = 0
        try:
            while not self.stop_event.is_set():
                success, frame = self.cap.read()
                if success:
                    consecutive_failures = 0
                    self._publish(frame)
                    continue

                consecutive_failures += 1
                if consecutive_failures >= 10:
                    break
                self.stop_event.wait(0.1)
        finally:
            self.finished_event.set()
            self.cap.release()

    def start(self) -> None:
        self.thread.start()

    def read(self, timeout: float = 0.5):
        try:
            return self.frames.get(timeout=timeout)
        except Empty:
            return None

    def stop(self) -> None:
        self.stop_event.set()
        self.thread.join(timeout=1)
        if self.thread.is_alive():
            self.cap.release()


def open_video_capture(source_val):
    try:
        if isinstance(source_val, int) and sys.platform == "win32":
            cap = cv2.VideoCapture(source_val, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap.release()
                cap = cv2.VideoCapture(source_val)
        elif isinstance(source_val, str) and (source_val.startswith("rtsp://") or source_val.startswith("rtsps://")):
            # Configurar FFmpeg para RTSP en TCP por defecto para evitar paquetes perdidos por UDP
            try:
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|analyzeduration;1000000|probesize;1000000|stimeout;5000000"
            except Exception:
                pass
            cap = cv2.VideoCapture(source_val, cv2.CAP_FFMPEG)
            if not cap.isOpened():
                cap.release()
                cap = cv2.VideoCapture(source_val)
        else:
            cap = cv2.VideoCapture(source_val)

        if cap.isOpened():
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap
    except Exception:
        # Retornar objeto de captura cerrado o dummy si ocurre algún error inesperado
        return cv2.VideoCapture()



@router.get("", response_model=List[CameraResponse])
def get_cameras(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    repo = CameraRepository(db)
    cameras = repo.get_all()
    zones = allowed_zones_for_user(current_user)
    if zones is not None:
        cameras = [camera for camera in cameras if camera.zone in zones]
    return [camera_response_for_user(camera, current_user) for camera in cameras]


@router.post("", response_model=CameraResponse)
def create_camera(
    payload: CameraCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    """Permite registrar nuevas cámaras (cámaras USB locales, cámaras IP/celular o RTSP)."""
    repo = CameraRepository(db)
    camera = Camera(
        name=payload.name,
        zone=payload.zone,
        source=payload.source,
        confidence_threshold=payload.confidence_threshold,
        is_active=payload.is_active,
        is_connected=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(camera)
    db.flush()
    record_audit(db, current_user, "camera.created", "camera", str(camera.id), {"name": camera.name, "zone": camera.zone})
    return repo.create(camera)


@router.get("/{camera_id}", response_model=CameraResponse)
def get_camera(
    camera_id: int = Path(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    repo = CameraRepository(db)
    cam = repo.get_by_id(camera_id)
    if not cam:
        raise NotFoundException(f"Cámara #{camera_id} no encontrada")
    if not user_can_access_zone(current_user, cam.zone):
        raise ForbiddenException("No tiene acceso a la zona de esta cámara")
    return camera_response_for_user(cam, current_user)


@router.put("/{camera_id}", response_model=CameraResponse)
def update_camera(
    camera_id: int,
    payload: CameraUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    repo = CameraRepository(db)
    cam = repo.get_by_id(camera_id)
    if not cam:
        raise NotFoundException(f"Cámara #{camera_id} no encontrada")

    if payload.name is not None:
        cam.name = payload.name
    if payload.zone is not None:
        cam.zone = payload.zone
    if payload.source is not None:
        cam.source = payload.source
    if payload.is_active is not None:
        cam.is_active = payload.is_active
    if payload.confidence_threshold is not None:
        cam.confidence_threshold = payload.confidence_threshold
    if payload.is_connected is not None:
        cam.is_connected = payload.is_connected

    cam.updated_at = datetime.now(timezone.utc)
    record_audit(
        db,
        current_user,
        "camera.updated",
        "camera",
        str(cam.id),
        {"changed_fields": sorted(payload.model_dump(exclude_unset=True).keys())},
    )
    return camera_response_for_user(repo.update(cam), current_user)


@router.delete("/{camera_id}")
def delete_camera(
    camera_id: int = Path(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("ADMIN"))
):
    repo = CameraRepository(db)
    cam = repo.get_by_id(camera_id)
    if not cam:
        raise NotFoundException(f"Cámara #{camera_id} no encontrada")
    record_audit(db, current_user, "camera.deleted", "camera", str(cam.id), {"name": cam.name})
    repo.delete(cam)
    return {"message": f"Cámara #{camera_id} eliminada correctamente"}


@router.post("/{camera_id}/test", response_model=CameraResponse)
def test_camera_connection(
    camera_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("OPERATOR"))
):
    """Safely attempts to probe the camera source without keeping the capture stream open."""
    repo = CameraRepository(db)
    cam = repo.get_by_id(camera_id)
    if not cam:
        raise NotFoundException(f"Cámara #{camera_id} no encontrada")
    if not user_can_access_zone(current_user, cam.zone):
        raise ForbiddenException("No tiene permiso para probar cámaras de esta zona")

    source_val = cam.source
    if source_val.isdigit():
        source_val = int(source_val)

    is_ok = False
    try:
        cap = open_video_capture(source_val)
        if cap.isOpened():
            ret, _ = cap.read()
            is_ok = bool(ret)
    except Exception:
        is_ok = False
    finally:
        if "cap" in locals():
            cap.release()

    cam.is_connected = is_ok
    cam.last_check_at = datetime.now(timezone.utc)
    return camera_response_for_user(repo.update(cam), current_user)


@router.post("/{camera_id}/stream-ticket")
def create_camera_stream_ticket(
    camera_id: int = Path(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    camera = CameraRepository(db).get_by_id(camera_id)
    if not camera:
        raise NotFoundException(f"Cámara #{camera_id} no encontrada")
    if not user_can_access_zone(current_user, camera.zone):
        raise ForbiddenException("No tiene acceso a la zona de esta cámara")
    if not camera.is_active:
        raise HTTPException(status_code=409, detail="La cámara está desactivada")

    now = datetime.now(timezone.utc)
    ticket = jwt.encode(
        {
            "sub": current_user.username,
            "purpose": "camera_stream",
            "camera_id": camera_id,
            "iat": now,
            "exp": now + timedelta(minutes=2),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    return {"ticket": ticket}


def generate_live_mjpeg_stream(
    cap: cv2.VideoCapture,
    conf_threshold: float,
    first_frame,
    show_confidence: bool = True,
    camera_id: Optional[int] = None,
):
    """
    Generator yielding live multipart/x-mixed-replace MJPEG frames.
    Performs real-time YOLO object detection and draws bounding boxes on each frame.
    """
    prev_time = time.time()
    reader = LatestFrameReader(cap, first_frame)
    reader.start()
    source_failed = False
    try:
        while True:
            frame = reader.read()
            if frame is None:
                if reader.finished:
                    source_failed = True
                    break
                continue

            curr_time = time.time()
            fps = 1.0 / max(0.001, (curr_time - prev_time))
            prev_time = curr_time

            # Inferencia YOLO en tiempo real si el modelo está disponible
            if yolo_service.is_loaded and yolo_service.model is not None:
                results = yolo_service.predict_frame(
                    frame=frame,
                    img_size=yolo_service.stream_img_size,
                    conf_threshold=conf_threshold,
                    iou_threshold=settings.YOLO_IOU_THRESHOLD
                )
                if len(results) > 0 and results[0].boxes is not None:
                    for box in results[0].boxes:
                        conf = float(box.conf[0])
                        if conf < conf_threshold:
                            continue
                        cls_id = int(box.cls[0])
                        cls_name = yolo_service.classes.get(cls_id, f"clase_{cls_id}").replace("chasis_", "")
                        x1, y1, x2, y2 = map(int, box.xyxy[0])

                        label = f"{cls_name} {conf * 100:.1f}%" if show_confidence else cls_name
                        # Bounding box
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (16, 185, 129), 2)

                        # Label badge
                        (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                        cv2.rectangle(
                            frame,
                            (x1, max(0, y1 - th - baseline - 8)),
                            (x1 + tw + 8, y1),
                            (16, 185, 129),
                            -1
                        )
                        cv2.putText(
                            frame,
                            label,
                            (x1 + 4, max(th + 2, y1 - 4)),
                            cv2.FONT_HERSHEY_SIMPLEX,
                            0.6,
                            (255, 255, 255),
                            2,
                            cv2.LINE_AA
                        )

            # FPS HUD
            cv2.putText(
                frame,
                f"Cardinova AI - FPS: {fps:.1f}",
                (14, 28),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2
            )

            ret, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75])
            frame = None
            if not ret:
                continue

            frame_bytes = buffer.tobytes()
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n")
    finally:
        reader.stop()
        if camera_id is not None:
            mark_stream_stopped(camera_id)
        if source_failed and camera_id is not None:
            db = SessionLocal()
            try:
                camera = CameraRepository(db).get_by_id(camera_id)
                if camera:
                    camera.is_connected = False
                    camera.last_check_at = datetime.now(timezone.utc)
                    CameraRepository(db).update(camera)
            finally:
                db.close()


@router.get("/{camera_id}/stream")
def stream_camera(
    camera_id: int = Path(...),
    ticket: Optional[str] = Query(None),
    show_confidence: bool = Query(True),
    db: Session = Depends(get_db)
):
    """
    Transmisión en tiempo real MJPEG con inferencia YOLO en vivo para visualización web.
    Permite visualizar directamente en el frontend usando una etiqueta <img src="/stream" />.
    """
    payload = decode_access_token(ticket) if ticket else None
    if (
        not payload
        or payload.get("purpose") != "camera_stream"
        or payload.get("camera_id") != camera_id
    ):
        raise UnauthorizedException("Ticket de video no válido o expirado")

    username = payload.get("sub")
    user = UserRepository(db).get_by_username(username) if username else None
    if not user or not user.is_active:
        raise UnauthorizedException("Usuario no autorizado para ver este video")
    
    repo = CameraRepository(db)
    cam = repo.get_by_id(camera_id)
    if not cam:
        raise NotFoundException(f"Cámara #{camera_id} no encontrada")
    if not user_can_access_zone(user, cam.zone):
        raise ForbiddenException("El permiso de zona fue revocado")

    source_val = int(cam.source) if cam.source.isdigit() else cam.source
    try:
        cap = open_video_capture(source_val)
        if not cap.isOpened():
            cap.release()
            raise HTTPException(status_code=503, detail="No se pudo abrir la fuente de video de la cámara")

        success, first_frame = cap.read()
        if not success:
            cap.release()
            raise HTTPException(status_code=503, detail="La cámara no está entregando video")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Error inesperado al conectar con el dispositivo de video: {str(exc)}"
        )

    cam.is_connected = True
    cam.last_check_at = datetime.now(timezone.utc)
    repo.update(cam)
    mark_stream_started(camera_id)
    return StreamingResponse(
        generate_live_mjpeg_stream(cap, cam.confidence_threshold, first_frame, show_confidence, camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

