import sys
import os
import json

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app.db.session import SessionLocal
from app.db.models.camera import Camera
from app.db.models.system_setting import SystemSetting


def seed_initial_cameras_and_settings():
    db = SessionLocal()
    try:
        # Initial 3 production cameras
        cameras_data = [
            {
                "name": "Cámara Zona 1 - Doblado",
                "zone": "DOBLADO_LAMINA",
                "source": "0",
                "confidence_threshold": 0.60
            },
            {
                "name": "Cámara Zona 2 - Armado",
                "zone": "ARMADO_ESTRUCTURAL",
                "source": "1",
                "confidence_threshold": 0.65
            },
            {
                "name": "Cámara Zona 3 - Vinilado",
                "zone": "VINILADO",
                "source": "2",
                "confidence_threshold": 0.70
            }
        ]

        for cam in cameras_data:
            existing = db.query(Camera).filter(Camera.zone == cam["zone"]).first()
            if not existing:
                camera = Camera(
                    name=cam["name"],
                    zone=cam["zone"],
                    source=cam["source"],
                    confidence_threshold=cam["confidence_threshold"],
                    is_active=True,
                    is_connected=False
                )
                db.add(camera)
                print(f"[+] Cámara registrada: {cam['name']} ({cam['zone']})")
            else:
                print(f"[i] Cámara para zona {cam['zone']} ya existe (ID: {existing.id})")

        # Initial class to stage mapping setting
        mapping = {
            "chasis_doblado": "DOBLADO_LAMINA",
            "chasis_estructurado": "ARMADO_ESTRUCTURAL",
            "chasis_vinilado": "VINILADO",
            "lamina": "DOBLADO_LAMINA"
        }
        
        setting = db.query(SystemSetting).filter(SystemSetting.key == "class_stage_mapping").first()
        if not setting:
            db.add(SystemSetting(
                key="class_stage_mapping",
                value=json.dumps(mapping),
                description="Mapeo de clases de visión YOLO a etapas productivas"
            ))
            print("[+] Configuración 'class_stage_mapping' registrada.")

        db.commit()
        print("[+] Inicialización completada con éxito.")
    except Exception as e:
        db.rollback()
        print(f"[-] Error en inicialización: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_initial_cameras_and_settings()
