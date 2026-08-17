import cv2
import numpy as np
from typing import List, Tuple

class LayeringService:
    def composite(self, background: np.ndarray, foreground_rgba: np.ndarray) -> np.ndarray:
        """Composite RGBA foreground onto BGR background."""
        alpha = foreground_rgba[:, :, 3] / 255.0
        for c in range(0, 3):
            background[:, :, c] = background[:, :, c] * (1 - alpha) + foreground_rgba[:, :, c] * alpha
        return background

    def render_outfit(self, mannequin: np.ndarray, garments: List[np.ndarray]) -> np.ndarray:
        """Render multiple warped garments onto a mannequin."""
        result = mannequin.copy()
        for garment in garments:
            result = self.composite(result, garment)
        return result
