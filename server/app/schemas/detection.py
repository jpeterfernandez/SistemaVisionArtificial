from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field, ConfigDict


class BoundingBox(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


class DetectionItem(BaseModel):
    class_id: int
    class_name: str
    stage_name: Optional[str] = None
    confidence: float
    bbox: BoundingBox


class DetectionImageResponse(BaseModel):
    model_status: str
    inference_time_ms: float
    total_detections: int
    image_width: int
    image_height: int
    detections: List[DetectionItem]
    annotated_image_base64: Optional[str] = None


class DetectionResponse(BaseModel):
    id: int
    camera_id: Optional[int] = None
    zone: Optional[str] = None
    class_name: str
    confidence: float
    bbox_x1: int
    bbox_y1: int
    bbox_x2: int
    bbox_y2: int
    inference_time_ms: float
    image_path: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ModelStatusResponse(BaseModel):
    loaded: bool
    model_path: str
    device: str
    classes: dict
    conf_threshold: float
    iou_threshold: float
    img_size: int


class YoloRuntimeConfiguration(BaseModel):
    device_mode: Literal["auto", "cpu", "gpu"] = "auto"
    cpu_threads: int = Field(ge=1, le=256)
    gpu_memory_fraction: float = Field(ge=0.5, le=1.0)
    stream_img_size: int = Field(ge=320, le=1280, multiple_of=32)
