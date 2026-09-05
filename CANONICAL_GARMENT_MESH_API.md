# Canonical Garment Mesh API

## Module: `src/lib/canonicalGarmentMesh.ts`

Core utilities for generating 3D garment meshes from alpha silhouettes.

---

## Interfaces

### `GarmentMeshOptions`

Configuration for mesh generation.

```typescript
export interface GarmentMeshOptions {
  proportions: {
    shoulderW: number;
    shoulderD: number;
    bustW: number;
    bustD: number;
    waistW: number;
    waistD: number;
    hipW: number;
    hipD: number;
    neckR: number;
  };
  bodyLandmarks: {
    hipY: number;
    waistY: number;
    chestY: number;
    necklineSquareY: number;
    shoulderY: number;
    neckBaseY: number;
    skirtHemY: number;
  };
  category: Category;
  avatarType: AvatarType;
  scale?: number;
}
```

**Fields:**

- `proportions` — Body width/depth dimensions for the selected avatar type
  - Example: `PROPORTIONS['feminine']` from `ThreeMannequin.tsx`

- `bodyLandmarks` — Y-axis (height) positions for key anatomical points
  - Example: `BODY` from `ThreeMannequin.tsx`
  - Used to determine which body region each category maps to

- `category` — Garment category: `'top' | 'jacket' | 'dress' | 'bottom' | 'skirt' | 'shoes' | ...`
  - Controls Y-range mapping

- `avatarType` — Avatar shape: `'feminine' | 'masculine' | 'neutral'`
  - Selects proportions

- `scale` — Optional garment scale multiplier (default: 1.0)
  - Affects total mesh height

---

## Exported Functions

### `buildCanonicalGarmentMesh(canonicalAsset, options): Promise<BufferGeometry | null>`

Main entry point. Converts alpha mask to 3D mesh.

**Parameters:**

- `canonicalAsset: CanonicalGarmentAsset`
  - Must have `alphaMaskUrl` or `alpha_mask_url` field
  - From Phase 1 pipeline

- `options: GarmentMeshOptions`
  - Mesh generation configuration

**Returns:**

- `Promise<THREE.BufferGeometry | null>`
- Geometry if successful, null if any step fails
- Automatically logged errors; silent fallback

**Process:**

1. Validate `canonicalAsset` has alpha URL
2. Load image from `alphaMaskUrl`
3. Extract alpha channel to Uint8Array
4. Detect contours and bounding box
5. Map 2D silhouette to 3D based on category
6. Triangulate and compute normals
7. Return `BufferGeometry`

**Example:**

```typescript
const geometry = await buildCanonicalGarmentMesh(garment.canonicalAsset, {
  proportions: PROPORTIONS['feminine'],
  bodyLandmarks: BODY,
  category: 'dress',
  avatarType: 'feminine',
  scale: 1.0,
});

if (geometry) {
  mesh.geometry = geometry; // assign to Three.js mesh
}
```

---

### `hasValidCanonicalAsset(canonicalAsset): boolean`

Quick check for alpha mask availability.

**Parameters:**

- `canonicalAsset: CanonicalGarmentAsset | undefined`

**Returns:**

- `true` if asset has `alphaMaskUrl` or `alpha_mask_url`
- `false` otherwise (null, undefined, or missing URL)

**Example:**

```typescript
if (hasValidCanonicalAsset(garment.canonicalAsset)) {
  // safe to call buildCanonicalGarmentMesh
}
```

---

## Internal Functions (not exported)

### `loadAlphaMask(imageUrl): Promise<{ width, height, alphaData }>`

Fetches image and extracts alpha channel.

- CORS-enabled
- Returns `null` on fetch/parsing failure
- Suitable for PNG, JPEG (alpha will be 255 for JPEG)

### `extractAlphaContour(alphaData, width, height, threshold): AlphaContour`

Scans alpha data row-by-row and column-by-column.

- `threshold: 127` (alpha > 127 = opaque)
- Returns bounding box and edge arrays
- Used to determine garment silhouette bounds

### `getBodyDimensionsAtY(y, proportions, landmarks): { rx, rz }`

Computes elliptical radii at a given height.

- Replicates mannequin model from `ThreeMannequin.tsx`
- Smooth interpolation across body regions
- Returns X-radius and Z-radius (depth)

---

## Integration with ThreeMannequin

### Hook: `useCanonicalGarmentMesh(canonicalAsset, category, avatarType, scale): BufferGeometry | null`

React hook (defined in `ThreeMannequin.tsx`).

**Behavior:**

- Async mesh loading with React state management
- Cancels previous request if dependencies change
- Safe for component cleanup

**Usage:**

```typescript
const canonicalMesh = useCanonicalGarmentMesh(
  garment.canonicalAsset,
  'dress',
  'feminine',
  1.0
);

const geometry = useMemo(() => {
  if (!isWrapCategory) return null;
  if (canonicalMesh) return canonicalMesh;  // prefer canonical
  return buildTailoredGarmentGeometry(...); // fallback
}, [isWrapCategory, canonicalMesh]);
```

---

## Data Flow

```
┌─────────────────────────────────────┐
│ React Component (GarmentPiece)      │
│ - garment.canonicalAsset            │
│ - category                          │
│ - avatarType                        │
│ - scale                             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ useCanonicalGarmentMesh Hook        │
│ - Async management                  │
│ - Cleanup on unmount                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ buildCanonicalGarmentMesh()         │
│ 1. loadAlphaMask()                  │
│ 2. extractAlphaContour()            │
│ 3. Map to 3D (category-specific)    │
│ 4. Triangulate                      │
│ 5. Return BufferGeometry            │
└──────────────┬──────────────────────┘
               │
               ▼ (null if error)
┌─────────────────────────────────────┐
│ React.useMemo (tailoredGeometry)    │
│ - Use canonical if available        │
│ - Fall back to buildTailoredGeometry│
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│ <mesh> Three.js Rendering          │
│ - geometry: tailoredGeometry        │
│ - material: MeshStandardMaterial    │
└─────────────────────────────────────┘
```

---

## Error Handling

All errors are caught and logged; fallback is automatic.

### Caught Errors

- Image fetch fails (CORS, 404, network)
  → `null` returned, fallback shell used

- Image parsing fails (corrupt PNG, wrong format)
  → `null` returned, fallback shell used

- No alpha pixels found
  → `null` returned, fallback shell used

- Contour extraction yields empty bounds
  → `null` returned, fallback shell used

- Triangulation fails (invalid indices, etc.)
  → Caught, logged, fallback shell used

### Logging

All failures logged to console with context:

```javascript
console.warn('No alpha mask URL in canonical asset');
console.warn('Failed to load alpha mask');
console.warn('No alpha pixels found in mask');
console.warn('Failed to build canonical garment mesh:', error);
```

---

## Performance Notes

### Typical Timings

| Operation | Time |
|-----------|------|
| Load 400×600 PNG | 10–50ms |
| Extract contours | 5–20ms |
| Triangulate & build geometry | 15–50ms |
| Total per garment | 30–120ms |

All async, non-blocking.

### Memory

- Alpha Uint8Array: ~width × height bytes
  - 400×600: ~240KB
  - Temporary, released after mesh generation

- BufferGeometry:
  - Typical: 8k–20k triangles = 96KB–240KB
  - Vertex data (position, UV, normal)

### Optimization Opportunities

- Cache loaded alpha masks (by URL)
- Contour simplification (reduce vertex count)
- LOD generation for distant view
- Worker thread for geometry generation (future)

---

## Compatibility

### Supported Image Formats

- PNG (full alpha support)
- JPEG (alpha defaults to 255)
- WebP (if browser/server support CORS)

### Browser Compatibility

- Requires Canvas API (`canvas.getImageData`)
- Requires `Image` element (all modern browsers)
- Requires CORS headers on image server

### Three.js Version

- Tested with Three.js (via `@react-three/fiber`)
- Uses standard `BufferGeometry` API
- Compatible with WebGL 1.0+

---

## Extensibility

### Adding New Category Support

Example: Custom category `'custom_category'`

1. Add to `Category` type in `types.ts`
2. Add handler in `buildCanonicalGarmentMesh()`:

```typescript
} else if (category === 'custom_category') {
  yTop = landmarks.customTop;
  yBottom = landmarks.customBottom;
}
```

3. Update fallback in `useCanonicalGarmentMesh()`

### Modifying Geometry Resolution

In `buildCanonicalGarmentMesh()`:

```typescript
const vSegments = Math.max(24, Math.ceil(garmentH / 8)); // adjust divisor
const uSegments = Math.max(32, Math.ceil(garmentW / 4)); // adjust divisor
```

Higher = more detail, more memory/computation
Lower = coarser mesh, faster

### Custom Conforming Strategy

Modify `getBodyDimensionsAtY()` to use different interpolation.

Example: Constant radius (not conforming):

```typescript
return {
  rx: bodyDims.rx * rowFrac,  // keep as is
  rz: bodyDims.rz * rowFrac,  // keep as is
};
// vs current: uses actual body profile interpolation
```

---

## Debugging

### Enable Verbose Logging

Add to `canonicalGarmentMesh.ts`:

```typescript
const DEBUG = true; // set to true

if (DEBUG) {
  console.log('Alpha mask loaded:', width, 'x', height);
  console.log('Contour bounds:', bounds);
  console.log('Geometry vertices:', positions.length / 3);
}
```

### Visualize Alpha Mask

In browser devtools:

```javascript
const img = new Image();
img.src = garment.canonicalAsset.alphaMaskUrl;
document.body.appendChild(img);
```

### Inspect Generated Geometry

In Three.js scene:

```javascript
geometry.computeBoundingBox();
console.log('Bounding box:', geometry.boundingBox);

const wireframe = new THREE.WireframeGeometry(geometry);
const line = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0xff0000 }));
scene.add(line);
```

---

## Future Enhancements

### Phase 2.1: Back-Panel Synthesis

- Load front and optional back images
- Blend transition from front to back
- Synthesize side regions with heuristics

### Phase 2.2: Sleeve/Strap Detailing

- Detect armholes in contour
- Generate 3D sleeve tubes conforming to silhouette
- Attach straps procedurally

### Phase 2.3: Split Leg Meshes

- Detect center seam in `bottom` category
- Split left/right leg contours
- Generate two independent leg meshes

### Phase 2.4: Interactive Fitting

- Allow user to drag mesh vertices
- Real-time update and saving
- Personalized fit refinement

---

## References

- **Phase 1 Extraction:** `backend/services/garment_segmentation.py`
- **Mannequin Model:** `src/components/ThreeMannequin.tsx` (PROPORTIONS, BODY, getBodyDimensions)
- **Types:** `src/types.ts` (CanonicalGarmentAsset, Category, AvatarType)
- **Integration:** `src/components/ThreeMannequin.tsx` (useCanonicalGarmentMesh, GarmentPiece)
