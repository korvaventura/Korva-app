# Dubrovnik composition review

Original Old Town model restored as foreground; separately generated surrounding model as background. 183,474 + 87,032 triangles. Color textures 2048 + 1024. Geometry uses the existing native packed codec, with no runtime GLB/Blob/WASM. Background normals are recomputed into Float32 after masking the city footprint. The combined conservative collision height grid is separate from the exact offline visual route.

This is a review composition, not a surveyed reconstruction. The recognizable perimeter and harbor are restored. Named checkpoint placement remains illustrative on generated geometry. Challenge distances, stored coordinates and user progress are unchanged.

Packing: node mobile/scripts/empacarRevisionDubrovnik.cjs preview-assets.json (prepared source asset data). Original uploads remain preserved.
