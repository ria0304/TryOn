"""Strap classification + 3D reconstruction endpoints.

Ported over during the mannequin-swap merge from the
`3d-mannequin-garment-viewer` project. Ported as-is; the CV heuristics and
reconstruction control points below are ``strap_cv_analyzer``'s own and
haven't been re-validated against TryOn's mannequin geometry.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.strap_cv_analyzer import PythonStrapCVAnalyzer

router = APIRouter(tags=["strap-analysis"])


class GarmentAnalysisRequest(BaseModel):
    imageUrl: Optional[str] = None
    category: Optional[str] = None
    garmentId: Optional[str] = None


class Reconstruct3DRequest(BaseModel):
    strapType: str
    backStyle: str
    isBackDetermined: bool
    liningColor: Optional[str] = "#1e40af"
    wrapRepeatX: Optional[float] = 1.0


@router.post("/api/analyze-garment")
async def analyze_garment(request: GarmentAnalysisRequest):
    image_input = request.imageUrl or request.garmentId or "sample_green_slip"
    try:
        return PythonStrapCVAnalyzer.analyze_garment_image(image_input)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/reconstruct-3d")
async def reconstruct_3d(request: Reconstruct3DRequest):
    try:
        straps_spec = []
        if request.strapType == "thin_double_straps":
            straps_spec = [
                {
                    "name": "left_front_to_back",
                    "ribbonWidth": 0.02,
                    "thickness": 0.008,
                    "colorHex": request.liningColor or "#1e40af",
                    "controlPoints": [
                        {"x": 0.17, "y": 0.88, "z": 0.17},
                        {"x": 0.17, "y": 1.15, "z": 0.05},
                        {"x": 0.17, "y": 0.88, "z": -0.17},
                    ],
                },
                {
                    "name": "right_front_to_back",
                    "ribbonWidth": 0.02,
                    "thickness": 0.008,
                    "colorHex": request.liningColor or "#1e40af",
                    "controlPoints": [
                        {"x": -0.17, "y": 0.88, "z": 0.17},
                        {"x": -0.17, "y": 1.15, "z": 0.05},
                        {"x": -0.17, "y": 0.88, "z": -0.17},
                    ],
                },
            ]
        elif request.strapType == "halter_neck":
            straps_spec = [
                {
                    "name": "halter_collar_loop",
                    "ribbonWidth": 0.035,
                    "thickness": 0.01,
                    "colorHex": request.liningColor or "#1e40af",
                    "controlPoints": [
                        {"x": 0.14, "y": 0.85, "z": 0.18},
                        {"x": 0.08, "y": 1.14, "z": 0.06},
                        {"x": 0.0, "y": 1.18, "z": -0.09},
                        {"x": -0.08, "y": 1.14, "z": 0.06},
                        {"x": -0.14, "y": 0.85, "z": 0.18},
                    ],
                }
            ]

        return {
            "isBackDetermined": request.isBackDetermined,
            "strapType": request.strapType,
            "backStyle": request.backStyle,
            "backDeterminationMessage": "Topology generated safely.",
            "straps": straps_spec,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
