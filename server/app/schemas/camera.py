from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class CameraBase(BaseModel):
    name: str = Field(..., max_length=100)
    zone: str = Field(..., description="DOBLADO_LAMINA, ARMADO_ESTRUCTURAL, VINILADO")
    source: str = Field("0", max_length=255)
    is_active: bool = True
    confidence_threshold: float = Field(0.60, ge=0.1, le=1.0)


class CameraCreate(CameraBase):
    pass


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    zone: Optional[str] = None
    source: Optional[str] = None
    is_active: Optional[bool] = None
    confidence_threshold: Optional[float] = Field(None, ge=0.1, le=1.0)
    is_connected: Optional[bool] = None


class CameraResponse(CameraBase):
    id: int
    is_connected: bool
    last_detection_at: Optional[datetime] = None
    last_check_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
