# Dubrovnik complete landscape mobile asset

Original user-provided Meshy_AI_dubrovnik_full_landsc_1006123416_image-to-3d-texture.glb retained separately: 119,130,500 bytes, 2,954,952 triangles. Generated interpretation, not surveyed geography.

Offline glTF Transform weld + Meshopt simplification ratio .075, error .0007 -> 221,540 triangles, 181,070 vertices. Native quantized buffers, lossless delta-varint indices. Color JPEG 4096 brightness 1.08 saturation 1.12; normal/surface JPEG 1024, quality 92. Total about 11.9 MB. A single landscape replaces the previous separate town/mainland meshes; their old assets are no longer required by the runtime.

Transform x=(source.x-source.z)*2; z=(source.x+source.z)*2-1.7. Source reconstruction is shallow; y=(source.y+.040543)*3 plus .65 smoothstep(t), t=clamp((-z-1.3)/2.8,0,1), provides a continuous raised rear hillside. This is artistic terrain deformation, not an accurate reconstruction of Mount Srd. Normals recomputed offline in Float32 and subsequently packed i8. Height grid 160x160 contains conservative neighborhood maxima for route/camera clearance. Ocean and harbor water supplied by an app plane at y=.012, no new generated mesh required.

Camera and visual route calibrated to this interpretation, with kilometer checkpoint anchors preserved. No backend or stored progress changes. Fine alignment, colors and mobile frame rate require on-device review.
