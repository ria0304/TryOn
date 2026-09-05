import cv2
import numpy as np
from scipy.interpolate import Rbf
from typing import Dict, List, Optional, Tuple

TOP_CATEGORIES = {
    "top", "shirt", "jacket", "hoodie", "coat", "cardigan", "blazer",
    "sweater", "tank", "crop top",
}
BOTTOM_CATEGORIES = {"bottom", "pants", "shorts", "jeans", "trousers", "leggings"}


def _premultiply(rgba: np.ndarray) -> np.ndarray:
    """RGB * alpha, as float32.

    Without this, `cv2.warpAffine`/`cv2.remap`'s linear interpolation blends
    each edge pixel's RGB against its neighbors' RGB regardless of their
    alpha -- so a visible pixel next to a fully-transparent one (RGB
    typically 0,0,0 in a background-removed cutout) gets pulled toward
    black even though the transparent neighbor contributes nothing to the
    final composite. That produces a dark ring around every warped
    silhouette edge. Premultiplying first makes a transparent neighbor's
    contribution correctly (0, 0, 0) at weight 0, not (0, 0, 0) at weight
    reflecting its RGB -- interpolating premultiplied values and dividing
    alpha back out afterward is the standard fix."""
    out = rgba.astype(np.float32).copy()
    a = out[:, :, 3:4] / 255.0
    out[:, :, :3] *= a
    return out


def _unpremultiply(premult: np.ndarray) -> np.ndarray:
    """Inverse of `_premultiply`, applied after interpolation."""
    out = premult.copy()
    a = out[:, :, 3:4] / 255.0
    safe_a = np.where(a > 1e-6, a, 1.0)
    out[:, :, :3] = out[:, :, :3] / safe_a
    return np.clip(out, 0, 255).astype(np.uint8)


class WarpingEngine:
    def warp_tps(
        self,
        image: np.ndarray,
        source_pts: np.ndarray,
        target_pts: np.ndarray,
        output_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        """Warp `image` with a thin-plate-spline so source points land on the
        target points, rendered directly onto an `output_size` canvas.

        The warp is solved in the inverse direction (target -> source) and
        evaluated on the output grid, so the destination points sit at their
        true coordinates with no post-hoc rescale -- a dress's waist lands on
        the mannequin's waist rather than being shrunk by a later resize.
        """
        src = np.asarray(source_pts, dtype=np.float64).reshape(-1, 2)
        dst = np.asarray(target_pts, dtype=np.float64).reshape(-1, 2)

        # Drop duplicate source points (they make the RBF solve singular).
        seen = set()
        keep = []
        for s, d in zip(src, dst):
            key = (int(s[0]), int(s[1]))
            if key not in seen:
                seen.add(key)
                keep.append((s, d))
        if keep:
            src = np.array([k[0] for k in keep], dtype=np.float64)
            dst = np.array([k[1] for k in keep], dtype=np.float64)

        if output_size is None:
            h, w = image.shape[:2]
        else:
            tw, th = output_size
            w, h = int(tw), int(th)

        if len(src) < 5:
            return self.warp_affine(image, src, dst, output_size=(w, h))

        try:
            rbf_x = Rbf(dst[:, 0], dst[:, 1], src[:, 0], function="thin_plate")
            rbf_y = Rbf(dst[:, 0], dst[:, 1], src[:, 1], function="thin_plate")
        except Exception:
            return self.warp_affine(image, src, dst, output_size=(w, h))

        gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        map_x = rbf_x(gx, gy)
        map_y = rbf_y(gx, gy)

        src_h, src_w = image.shape[:2]
        valid = (map_x >= 0) & (map_x <= src_w - 1) & (map_y >= 0) & (map_y <= src_h - 1)

        # Restrict rendering to the convex hull of the destination points so
        # the warp doesn't smear fabric into the surrounding canvas via
        # thin-plate extrapolation outside the fitted silhouette.
        hull_mask = np.zeros((h, w), dtype=np.uint8)
        if len(dst) >= 3:
            cv2.fillConvexPoly(hull_mask, cv2.convexHull(dst.astype(np.int32)), 255)
            if hull_mask.mean() < 1e-4:
                # Degenerate (collinear) points: use a padded bounding box.
                x0, y0 = int(dst[:, 0].min()), int(dst[:, 1].min())
                x1, y1 = int(dst[:, 0].max()), int(dst[:, 1].max())
                pad = max(4, int((x1 - x0) * 0.1), int((y1 - y0) * 0.1))
                cv2.rectangle(hull_mask, (max(0, x0 - pad), max(0, y0 - pad)),
                              (min(w - 1, x1 + pad), min(h - 1, y1 + pad)), 255, -1)
        valid &= hull_mask > 0

        map_xc = np.clip(map_x, 0, src_w - 1).astype(np.float32)
        map_yc = np.clip(map_y, 0, src_h - 1).astype(np.float32)

        has_alpha = image.shape[2] == 4
        src_img = _premultiply(image) if has_alpha else image
        sampled = cv2.remap(
            src_img, map_xc, map_yc,
            interpolation=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        if has_alpha:
            sampled = _unpremultiply(sampled)
        out = np.zeros((h, w, image.shape[2]), dtype=np.uint8)
        out[valid] = sampled[valid]
        return out

    def warp_affine(
        self,
        image: np.ndarray,
        source_pts: np.ndarray,
        target_pts: np.ndarray,
        output_size: Optional[Tuple[int, int]] = None,
    ) -> np.ndarray:
        """Fallback affine transform."""
        src = np.asarray(source_pts, dtype=np.float32).reshape(-1, 2)
        dst = np.asarray(target_pts, dtype=np.float32).reshape(-1, 2)
        if output_size is None:
            h, w = image.shape[:2]
        else:
            tw, th = output_size
            w, h = int(tw), int(th)
        if len(src) >= 3:
            M = cv2.getAffineTransform(src[:3], dst[:3])
            return self.warp_affine_matrix(image, M, (w, h))
        if output_size is not None and (w, h) != image.shape[:2]:
            return cv2.resize(image, (w, h), interpolation=cv2.INTER_LINEAR)
        return image

    def warp_affine_matrix(
        self,
        image: np.ndarray,
        M: np.ndarray,
        output_size: Tuple[int, int],
    ) -> np.ndarray:
        """Apply a 2x3 (or 3x3, only the top 2 rows used) affine matrix with
        premultiplied-alpha interpolation, so RGBA edges don't pick up the
        dark-fringe halo described in `_premultiply`. Shared by every
        placement-stage warpAffine call (the fitting service's similarity
        transform, the evaluation baselines) so they're not silently
        exposed to the artifact the alpha-aware warpers above already fix."""
        w, h = int(output_size[0]), int(output_size[1])
        M2 = np.asarray(M, dtype=np.float32)[:2]
        has_alpha = image.shape[2] == 4
        src_img = _premultiply(image) if has_alpha else image
        warped = cv2.warpAffine(
            src_img, M2, (w, h),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        if has_alpha:
            warped = _unpremultiply(warped)
        return warped

    def apply_folds(self, image: np.ndarray, intensity: float = 0.05) -> np.ndarray:
        """Heuristic to add natural-looking folds by slight local distortions."""
        h, w = image.shape[:2]
        y_grid, x_grid = np.meshgrid(np.arange(w), np.arange(h))
        flex_x = x_grid + intensity * 3 * np.sin(x_grid / 25.0)
        flex_y = y_grid + intensity * 2 * np.cos(y_grid / 30.0)
        return cv2.remap(
            image, flex_x.astype(np.float32), flex_y.astype(np.float32),
            interpolation=cv2.INTER_LINEAR,
        )

    def feather_edges(self, rgba: np.ndarray, sigma: float = 1.2) -> np.ndarray:
        """Soften the alpha boundary so the garment blends into the body
        instead of having a hard painted-on edge.

        The softening is confined to a thin ring around the solid silhouette so
        it can never grow the shape: no phantom wide rows above a neckline or
        stray specks below a hem (Gaussian support spreads the full-width halo
        of a wide row into the empty rows around it if left uncapped)."""
        if rgba.shape[2] < 4:
            return rgba
        alpha = rgba[:, :, 3].astype(np.float32) / 255.0
        if alpha.max() <= 0:
            return rgba
        interior = alpha >= 0.5
        if not interior.any():
            return rgba
        blurred = cv2.GaussianBlur(alpha, (0, 0), sigma)
        soft = np.clip((blurred - 0.5) * 2 + 0.5, 0.0, 1.0)
        out = np.where(interior, np.maximum(alpha, soft), blurred)
        # Keep the softened ring only ~1px outside the solid silhouette.
        ring = cv2.dilate(interior.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
        out = np.where(ring, out, 0.0)
        rgba = rgba.copy()
        rgba[:, :, 3] = (out * 255).astype(np.uint8)
        return rgba

    def add_depth_shading(
        self,
        rgba: np.ndarray,
        category: Optional[str] = None,
        body_lms: Optional[Dict[str, Tuple[int, int]]] = None,
        intensity: float = 0.09,
    ) -> np.ndarray:
        """Add simple shading so the garment reads as worn around a body.

        - Side shading: each pixel darkens toward the silhouette edge, which
          suggests the fabric wrapping around the torso.
        - Neckline / waist creases: soft horizontal bands just below the neck
          and at the waist, suggesting where the fabric folds against the body.
        """
        if rgba.shape[2] < 3:
            return rgba
        out = rgba.copy()
        rgb = out[:, :, :3].astype(np.float32)
        alpha = out[:, :, 3] / 255.0
        mask = alpha > 0
        if not mask.any():
            return out

        h, w = mask.shape
        ys, xs = np.nonzero(mask)
        order = np.argsort(ys, kind="stable")
        ys, xs = ys[order], xs[order]
        row_l, row_r = {}, {}
        start = 0
        for i in range(1, len(ys) + 1):
            if i == len(ys) or ys[i] != ys[start]:
                y = int(ys[start])
                row_l[y], row_r[y] = int(xs[start]), int(xs[i - 1])
                start = i

        rows = np.arange(h)
        cols = np.arange(w)
        shade = np.ones((h, w), dtype=np.float32)
        for y in row_l:
            l, r = row_l[y], row_r[y]
            half = max((r - l) / 2.0, 1.0)
            mid = (l + r) / 2.0
            d = np.clip(np.abs(cols - mid) / half, 0.0, 1.0)
            edge = d * d
            shade[y] = 1.0 - intensity * 0.7 * edge

        rgb *= shade[:, :, None]

        if body_lms:
            def crease(y_center, strength):
                if y_center is None:
                    return
                band = np.exp(-0.5 * ((rows - y_center) / 3.0) ** 2)[:, None]
                rgb[:] = rgb * (1.0 - strength * (band * mask)[:, :, None])

            neck = body_lms.get("NECK")
            waist = body_lms.get("WAIST")
            if neck:
                crease(neck[1], 0.10)
            if waist:
                crease(waist[1], 0.06)

        out[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
        return out

    def _body_width_profile(
        self, body_lms: Dict[str, Tuple[int, int]], h: int
    ) -> np.ndarray:
        """Smooth full-width body profile (px) for every canvas row, built from
        the mannequin's landmark distances (shoulders 96, bust 80, waist 64,
        hips 76, knees 48, ankles 44)."""
        pts: List[Tuple[float, float]] = []
        for kl, kr in (
            ("LEFT_SHOULDER", "RIGHT_SHOULDER"),
            ("LEFT_ARMPIT", "RIGHT_ARMPIT"),
            ("LEFT_BUST", "RIGHT_BUST"),
            ("LEFT_WAIST", "RIGHT_WAIST"),
            ("LEFT_HIP", "RIGHT_HIP"),
            ("LEFT_KNEE", "RIGHT_KNEE"),
            ("LEFT_ANKLE", "RIGHT_ANKLE"),
        ):
            if kl in body_lms and kr in body_lms:
                y = (body_lms[kl][1] + body_lms[kr][1]) / 2.0
                half = (body_lms[kr][0] - body_lms[kl][0]) / 2.0
                pts.append((y, max(half, 1.0)))
        if not pts:
            return np.full(h, 96.0, dtype=np.float32)
        pts.sort()
        ys = np.array([p[0] for p in pts], dtype=np.float64)
        hws = np.array([p[1] for p in pts], dtype=np.float64)
        half = np.interp(np.arange(h, dtype=np.float64), ys, hws)
        return np.clip(half * 2.0, 8.0, 400.0).astype(np.float32)

    def _fit_strength(
        self,
        category: str,
        body_lms: Dict[str, Tuple[int, int]],
        top_row: int,
        hem_row: int,
        h: int,
        sleeve_end_row: Optional[int] = None,
    ) -> np.ndarray:
        """Per-row strength (0..1) saying how hard the fabric is pulled onto the
        body silhouette at that row.

        The garment keeps its own cut outside the fitted region: a dress flares
        naturally below the hips, a t-shirt hangs straight below the chest, and
        the neckline is never squeezed. Strength is smooth so fabric never kinks
        at a single row.

        For sleeved garments the sleeve band (shoulder line -> sleeve hem) is
        left at its natural width -- sleeves hang on the arm and must not be
        pulled into the torso silhouette.
        """
        rows = np.arange(h, dtype=np.float32)

        def interp(pts: List[Tuple[float, float]]) -> np.ndarray:
            pts = sorted(pts)
            xs = [p[0] for p in pts]
            ys_ = [p[1] for p in pts]
            return np.interp(rows, np.asarray(xs), np.asarray(ys_)).astype(np.float32)

        sh = body_lms["LEFT_SHOULDER"][1]
        bust = body_lms["LEFT_BUST"][1]
        waist = body_lms["WAIST"][1]
        hip = body_lms["LEFT_HIP"][1]
        sh = max(sh, top_row)

        if category == "dress":
            pts = [
                (top_row, 0.0), (sh - 6, 0.85), (bust + 6, 1.0),
                (waist, 0.85), (hip + 12, 0.85), (hip + 42, 0.0),
                (hem_row, 0.0),
            ]
        elif category in TOP_CATEGORIES:
            pts = [
                (top_row, 0.0), (sh - 6, 0.9), (bust + 8, 1.0),
                (waist, 0.4), (hem_row, 0.0),
            ]
        elif category in BOTTOM_CATEGORIES or category == "skirt":
            pts = [
                (top_row, 0.0), (waist - 8, 0.5), (waist + 6, 1.0),
                (hip + 10, 1.0), (hem_row, 0.0),
            ]
        else:
            pts = [(top_row, 0.0), (hem_row, 0.0)]
        s = interp(pts)

        # Leave the sleeve band at its natural width (sleeves hang on the arm,
        # they are not part of the torso silhouette being conformed).
        if sleeve_end_row is not None and category in TOP_CATEGORIES:
            lo = max(sh, top_row)
            hi = min(sleeve_end_row, waist)
            if hi > lo:
                x = np.clip((rows - lo) / (hi - lo), 0.0, 1.0)
                vshape = 0.15 + 0.85 * np.abs(2.0 * x - 1.0)
                s = np.where((rows >= lo) & (rows <= hi), s * vshape, s)
        return s

    def conform_to_body_silhouette(
        self,
        rgba: np.ndarray,
        body_lms: Dict[str, Tuple[int, int]],
        category: str,
        top_row: int,
        hem_row: int,
        sleeve_end_row: Optional[int] = None,
    ) -> np.ndarray:
        """Core adaptive warp: conform the already-placed garment's silhouette
        to the mannequin's body in the fitted region.

        The placement stage fixed scale, rotation and position (no vertical
        stretch, natural length). This stage then rescales each canvas ROW
        horizontally -- and only horizontally, rows never move vertically --
        so the fabric follows the body where it is worn: shoulders sit on the
        shoulders, the waist pinches to the waist, the hips fill out, and the
        hem keeps the garment's own flared cut. Everything is smoothed so the
        fabric bends rather than kinking.
        """
        h, w = rgba.shape[:2]
        alpha = rgba[:, :, 3]
        mask = alpha > 0
        if not mask.any():
            return rgba

        # Per-row garment width and centerline.
        ys, xs = np.nonzero(mask)
        order = np.argsort(ys, kind="stable")
        ys, xs = ys[order], xs[order]
        gw = np.zeros(h, dtype=np.float32)
        start = 0
        for i in range(1, len(ys) + 1):
            if i == len(ys) or ys[i] != ys[start]:
                y = int(ys[start])
                gw[y] = float(max(xs[i - 1] - xs[start] + 1, 1.0))
                start = i

        body_w = self._body_width_profile(body_lms, h)
        strength = self._fit_strength(
            category, body_lms, top_row, hem_row, h, sleeve_end_row=sleeve_end_row
        )
        strength = cv2.GaussianBlur(strength[:, None], (0, 0), 8.0)[:, 0]

        # Scale each row toward the body width, weighted by strength. The scale
        # is computed from the ACTUAL row widths (so it is never inflated by
        # vertical smoothing of a narrow top row), then smoothed so the fabric
        # bends over several rows instead of kinking at one.
        desired = gw + (body_w - gw) * strength
        scale = np.ones(h, dtype=np.float32)
        nz = gw > 1.0
        scale[nz] = np.clip(desired[nz] / gw[nz], 0.35, 2.6)
        scale = cv2.GaussianBlur(scale[:, None], (0, 0), 5.0)[:, 0]
        scale = np.clip(scale, 0.35, 2.6)

        # Remap about the body centerline; y is untouched (no vertical stretch).
        # remap() needs the inverse map: output pixel x_out samples source at
        # c + (x_out - c)/s, so scaling the silhouette by s narrows/widens the
        # row correctly.
        bx = w / 2.0
        gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        inv = np.where(scale > 1e-3, 1.0 / scale, 1.0)
        map_x = bx + (gx - bx) * inv[:, None]
        has_alpha = rgba.shape[2] == 4
        src_img = _premultiply(rgba) if has_alpha else rgba
        out = cv2.remap(
            src_img, map_x, gy.astype(np.float32),
            interpolation=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0),
        )
        return _unpremultiply(out) if has_alpha else out

    def process_garment(
        self,
        garment_rgba: np.ndarray,
        mapping: List[Tuple[Tuple[int, int], Tuple[int, int]]],
        target_size: Tuple[int, int],
    ) -> np.ndarray:
        """Complete warping pipeline: warp the garment onto the target canvas."""
        if not mapping or len(mapping) == 0:
            return cv2.resize(garment_rgba, target_size)

        src_pts = np.array([p[0] for p in mapping], dtype=np.float32)
        dst_pts = np.array([p[1] for p in mapping], dtype=np.float32)
        return self.warp_tps(garment_rgba, src_pts, dst_pts, output_size=target_size)
