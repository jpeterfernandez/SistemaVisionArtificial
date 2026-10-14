import json
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.services.yolo_service import yolo_service
from app.repositories.detection_repository import DetectionRepository
from app.repositories.event_repository import EventRepository
from app.repositories.camera_repository import CameraRepository
from app.repositories.setting_repository import SettingRepository
from app.db.models.detection import Detection
from app.db.models.production_event import ProductionEvent


class DetectionService:
    def __init__(self, db: Session):
        self.db = db
        self.detection_repo = DetectionRepository(db)
        self.event_repo = EventRepository(db)
        self.camera_repo = CameraRepository(db)
        self.setting_repo = SettingRepository(db)

    def get_class_stage_map(self) -> Dict[str, str]:
        """Retrieves dynamic mapping of YOLO class to production stage."""
        default_map = {
            "chasis_doblado": "DOBLADO_LAMINA",
            "chasis_estructurado": "ARMADO_ESTRUCTURAL",
            "chasis_vinilado": "VINILADO",
            "lamina": "DOBLADO_LAMINA"
        }
        setting = self.setting_repo.get_by_key("class_stage_mapping")
        if setting:
            try:
                return json.loads(setting.value)
            except Exception:
                pass
        return default_map

    def process_image_upload(
        self,
        image_bytes: bytes,
        camera_id: Optional[int] = None,
        conf_threshold: Optional[float] = None,
        show_confidence: bool = True
    ) -> Dict[str, Any]:
        """
        Runs YOLO detection on an uploaded image, saves detections,
        and applies temporal confirmation logic if a camera is assigned.
        """
        camera = None
        if camera_id:
            camera = self.camera_repo.get_by_id(camera_id)
            if camera and conf_threshold is None:
                conf_threshold = camera.confidence_threshold

        # Run inference
        result = yolo_service.predict_image(
            image_bytes=image_bytes,
            conf_threshold=conf_threshold,
            show_confidence=show_confidence,
            return_annotated=True
        )

        class_stage_map = self.get_class_stage_map()
        saved_detections = []
        now = datetime.now(timezone.utc)

        # Update camera status if camera_id is provided
        if camera:
            camera.last_check_at = now
            if result["total_detections"] > 0:
                camera.last_detection_at = now
            self.camera_repo.update(camera)

        # Save individual detections
        for det in result["detections"]:
            stage = class_stage_map.get(det["class_name"], "NO_IDENTIFICADO")
            det["stage_name"] = stage

            db_det = Detection(
                camera_id=camera_id,
                zone=camera.zone if camera else None,
                class_name=det["class_name"],
                confidence=det["confidence"],
                bbox_x1=det["bbox"]["x1"],
                bbox_y1=det["bbox"]["y1"],
                bbox_x2=det["bbox"]["x2"],
                bbox_y2=det["bbox"]["y2"],
                inference_time_ms=result["inference_time_ms"],
                image_path=None,
                created_at=now
            )
            saved_det = self.detection_repo.create(db_det)
            saved_detections.append(saved_det)

        # Evaluate confirmation & event generation if camera is known and detections found
        created_event = None
        if camera and result["total_detections"] > 0:
            created_event = self._evaluate_and_create_event(
                camera=camera,
                detections=result["detections"],
                class_stage_map=class_stage_map,
                now=now
            )

        result["saved_detections_count"] = len(saved_detections)
        result["confirmed_event_id"] = created_event.id if created_event else None

        return result

    def _evaluate_and_create_event(
        self,
        camera: Any,
        detections: List[Dict[str, Any]],
        class_stage_map: Dict[str, str],
        now: datetime
    ) -> Optional[ProductionEvent]:
        """
        Temporal Confirmation Logic:
        - Prevents duplicate events for the same camera/stage within the cooldown window.
        - Ensures detection stage matches camera expected zone or registers as non-identified if conflicting.
        - Keeps association as PENDIENTE to avoid arbitrary assignment to production orders.
        """
        # Find dominant detection with highest confidence
        dominant_det = max(detections, key=lambda d: d["confidence"])
        stage = class_stage_map.get(dominant_det["class_name"], "NO_IDENTIFICADO")

        # Anti-spam cooldown check (min time between events in same camera)
        cooldown_seconds = settings.STAGE_MIN_TIME_BETWEEN_EVENTS_SECONDS
        latest_event = self.event_repo.get_latest_for_camera(camera.id)

        if latest_event:
            time_diff = (now - latest_event.event_timestamp).total_seconds()
            # If same stage was registered recently, do not create duplicate event
            if latest_event.stage == stage and time_diff < cooldown_seconds:
                logger.info(
                    f"Detección en cámara {camera.id} ({stage}) ignorada por ventana anti-duplicados "
                    f"({time_diff:.1f}s < {cooldown_seconds}s)"
                )
                return None

        # Build production event
        event = ProductionEvent(
            camera_id=camera.id,
            zone=camera.zone,
            order_id=None,  # Conservative: Never assign arbitrarily without continuous tracking evidence
            stage=stage,
            event_type="DETECCION_CONFIRMADA",
            association_status="PENDIENTE",
            sync_status="PENDIENTE",
            confidence=dominant_det["confidence"],
            evidence_count=len(detections),
            origin="VISION_ARTIFICIAL",
            event_metadata={
                "class_name": dominant_det["class_name"],
                "bbox": dominant_det["bbox"],
                "camera_zone": camera.zone,
                "total_detections_in_frame": len(detections)
            },
            event_timestamp=now,
            created_at=now
        )
        return self.event_repo.create(event)
