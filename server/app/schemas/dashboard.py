from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from app.schemas.event import ProductionEventResponse
from app.schemas.camera import CameraResponse


class SystemStatusSummary(BaseModel):
    postgres_connected: bool
    yolo_loaded: bool
    odoo_connected: bool
    active_cameras_count: int
    connected_cameras_count: int
    api_latency_ms: Optional[float] = None


class StageCount(BaseModel):
    stage: str
    count: int


class ProductionTrendPoint(BaseModel):
    timestamp: datetime
    stage: str
    count: int


class DashboardStatsResponse(BaseModel):
    status: SystemStatusSummary
    total_orders: int
    in_progress_orders: int
    completed_orders: int
    total_detections_today: int
    total_events_today: int
    pending_association_events_count: int
    pending_sync_events_count: int
    stage_distribution: List[StageCount]
    recent_events: List[ProductionEventResponse]
    cameras: List[CameraResponse]


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    yolo_model: str
    odoo: str
