import cv2
import numpy as np
from .landmark_detector import LandmarkDetector
from typing import Dict, Tuple

class MannequinManager:
    def __init__(self, landmark_detector: LandmarkDetector):
        self.detector = landmark_detector
        # Default mannequin size based on the 2D canvas / SVG viewBox
        self.width = 400
        self.height = 550
        self.reference_landmarks = self._get_default_landmarks()

    def _get_default_landmarks(self) -> Dict[str, Tuple[int, int]]:
        """Reference body landmarks for the fitting canvas.

        These describe a real standing body (no face) inside the 400x550
        coordinate space, with a defined shoulder line, bust, waist and hips.
        Garments are warped onto these points, so a dress pulled in at the
        waist and flared at the hips lands on the correct silhouette instead
        of being flattened onto a stick figure.

        The widths follow the same relative proportions as the 3D mannequin's
        "neutral" avatar (shoulder .45 / bust .37 / waist .30 / hip .36),
        scaled so the shoulder line is 96px wide in this 400px canvas:
        bust 80px, waist 64px, hips 76px. Earlier versions used an extreme
        corset silhouette (28px waist), which made fitted garments look
        grotesquely pinched.
        """
        return {
            "HEAD": (200, 90),
            "NECK": (200, 150),
            "LEFT_SHOULDER": (152, 158),
            "RIGHT_SHOULDER": (248, 158),
            "LEFT_ARMPIT": (170, 188),
            "RIGHT_ARMPIT": (230, 188),
            "CHEST": (200, 210),
            "LEFT_BUST": (160, 210),
            "RIGHT_BUST": (240, 210),
            "WAIST": (200, 258),
            "LEFT_WAIST": (168, 258),
            "RIGHT_WAIST": (232, 258),
            "LEFT_HIP": (162, 305),
            "RIGHT_HIP": (238, 305),
            "LEFT_ELBOW": (130, 235),
            "RIGHT_ELBOW": (270, 235),
            "LEFT_WRIST": (120, 315),
            "RIGHT_WRIST": (280, 315),
            "LEFT_KNEE": (176, 470),
            "RIGHT_KNEE": (224, 470),
            "LEFT_ANKLE": (178, 530),
            "RIGHT_ANKLE": (222, 530),
        }

    def get_target_landmarks(self, mannequin_image: np.ndarray = None) -> Dict[str, Tuple[int, int]]:
        """Get landmarks for a mannequin image (detect or return default)."""
        if mannequin_image is not None:
            return self.detector.detect_body_landmarks(mannequin_image)
        return self.reference_landmarks
