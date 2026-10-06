# Dubrovnik mobile visual trial

Source: user's Meshy 7.1 Image-to-3D textured GLB, supplied 2026-10-06.
The source image is an AI architectural interpretation, not a surveyed city.
The uploaded original remains unmodified; this folder contains its mobile derivative.
Source SHA-256 is recorded in meta.js.

- Original: 111,276,708 bytes; 2,823,218 triangles.
- Simplification: glTF Transform weld + meshoptimizer, ratio 0.065, error 0.0007.
- Result: 183,474 triangles / 139,867 vertices; simplified GLB about 8.3 MB.
- Runtime files: about 5.4 MB (uncompressed total); no new runtime dependencies.
- Base color: 2048 px JPEG quality 92. Normal and metallic/roughness: 1024 px JPEG quality 90.
- Position and UV: unsigned 16-bit quantization; normals signed normalized 8-bit.
- Index: lossless zigzag varint deltas. One indexed mesh for the generated city.
- An offline 160 x 160 conservative top-surface grid places the existing route above the mesh.
- Meshy coordinates calibrated into scene units: x = source.z * 1.5 + 0.55;
  y = (source.y + 0.08) * 1.8; z = -source.x * 0.8 - 0.4.
  This calibration is illustrative, and needs a visual check against named landmarks.

Textures load through the native R3F/Expo TextureLoader as ordinary JPG assets,
avoiding embedded GLB image Blob support. Geometry is required/decoded when
Dubrovnik first opens and reused by the world cache. Color uses sRGB; other maps
are linear. All GLTF UVs use flipY=false. Keep the normal and surface maps.

The wider terrain, exterior neighborhoods, and Lovrijenac remain procedural.
Background terrain is lowered only under the asset with a feathered join.
Route x/z, challenge kilometer anchors, users' progress and backend are unchanged.
Disable modeloMeshy on the Dubrovnik scene to restore the procedural architecture.
Actual frame rate, GPU texture upload and landmark alignment need device testing.
