import io
import numpy as np
from PIL import Image
from rembg import remove
from typing import Tuple

class SegmentationService:
    def remove_background(self, image_bytes: bytes) -> Tuple[np.ndarray, np.ndarray]:
        """Remove background and return RGBA image and mask as numpy arrays."""
        result_bytes = remove(image_bytes)
        pil_image = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        rgba = np.array(pil_image)
        
        # Mask is the alpha channel
        mask = rgba[:, :, 3]
        
        return rgba, mask

    def get_garment_mask(self, rgba: np.ndarray) -> np.ndarray:
        """Extract mask from RGBA image."""
        return rgba[:, :, 3]
