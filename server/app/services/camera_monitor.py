import sys
import threading
from collections import Counter
from datetime import datetime, timezone
from typing import Callable, Optional

import cv2
from sqlalchemy.orm import Session

from app.repositories.camera_repository import CameraRepository


_stream_counts: Counter[int] = Counter()
_stream_lock = threading.Lock()


def mark_stream_started(camera_id: int) -> None:
    with _stream_lock:
        _stream_counts[camera_id] += 1


def mark_stream_stopped(camera_id: int) -> None:
    with _stream_lock:
        if _stream_counts[camera_id] <= 1:
            _stream_counts.pop(camera_id, None)
        else:
            _stream_counts[camera_id] -= 1


def is_stream_active(camera_id: int) -> bool:
    with _stream_lock:
        return _stream_counts[camera_id] > 0


def _open_capture(source: str):
    if source.isdigit() and sys.platform == "win32":
        capture = cv2.VideoCapture(int(source), cv2.CAP_DSHOW)
        if not capture.isOpened():
            capture.release()
            capture = cv2.VideoCapture(int(source))
        return capture
    return cv2.VideoCapture(int(source) if source.isdigit() else source)


def check_camera_connections(
    db: Session,
    capture_factory: Optional[Callable[[str], object]] = None,
) -> int:
    repository = CameraRepository(db)
    checked = 0
    for camera in repository.get_all(only_active=True):
        if is_stream_active(camera.id):
            continue
        capture = None
        is_connected = False
        try:
            capture = (capture_factory or _open_capture)(camera.source)
            if capture.isOpened():
                success, _frame = capture.read()
                is_connected = bool(success)
        except Exception:
            is_connected = False
        finally:
            if capture is not None:
                capture.release()

        camera.is_connected = is_connected
        camera.last_check_at = datetime.now(timezone.utc)
        repository.update(camera)
        checked += 1
    return checked
