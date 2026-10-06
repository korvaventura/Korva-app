# Dubrovnik mainland — mobile derivative

Source: Meshy_AI_dubrovnik_surrounding_1006114700_image-to-3d-texture.glb (original retained separately, 105,061,548 bytes / 2,406,080 triangles).

Generated interpretation, not surveyed cartography. Supplies organic hillside neighborhoods around the separate old-town asset. No changes to geographic checkpoints or stored progress.

Offline glTF Transform weld + Meshopt simplification ratio .055 / error .0007: 132,312 triangles. Quantized u16 positions and UVs, normalized i8 source normals, lossless delta-varint indices. Color JPEG 2048 (brightness 1.12, saturation 1.16), normal and surface JPEG 1024, quality 92. Total assets about 5.3 MB.

Scene transform: x = source.x * 3.4 + .55; z = source.z * 3 - 2.1; y = (source.y + .111) * 3. Reserved old-town and harbor rectangle [-.96, 2.06] x [-1.15, .38] lowered to -.028, with .35 smooth transition outside. Runtime recalculates normals after deformation. Highest-vertex neighborhood height grid 160 x 160 protects the camera. Old-town texture fill .12 / mainland .08 keeps shaded detail visible without changing other maps.

Fine coast alignment and touch performance still require an on-device review. The visual route combines ramparts with excursions to Lovrijenac and Stradun; challenge kilometer anchors remain 0,4,8,12,16,19.4.
