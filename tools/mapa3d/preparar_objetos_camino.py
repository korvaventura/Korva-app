"""Convert Meshy GLB props to RN-safe geometry and 1024px color textures.
Usage: python tools/mapa3d/preparar_objetos_camino.py INPUT_DIRECTORY
"""
import pathlib, struct, json, base64, io, sys
import numpy as np
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[2]
source=pathlib.Path(sys.argv[1]); out=root/'mobile/assets/mapa3d/camino-hitos'
models={'catedral':'Meshy_AI_santiago_cathedral_8k_1108094642_texture.glb','puente':'Meshy_AI_puente_la_reina_4k_1108094633_texture.glb','mojon':'Meshy_AI_camino_waymarker_2k_1108094649_texture.glb'}
for name, filename in models.items():
 raw=(source/filename).read_bytes(); size,kind=struct.unpack_from('<II',raw,12); g=json.loads(raw[20:20+size]); binary=raw[28+size:]
 def accessor(i):
  a=g['accessors'][i]; v=g['bufferViews'][a['bufferView']]; typ={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]; d=np.dtype(typ); cols={'VEC3':3,'VEC2':2,'SCALAR':1}[a['type']]
  off=v.get('byteOffset',0)+a.get('byteOffset',0); stride=v.get('byteStride',cols*d.itemsize)
  return np.ndarray((a['count'],cols),dtype=d,buffer=binary,offset=off,strides=(stride,d.itemsize)).copy()
 assert len(g['meshes'])==1 and len(g['meshes'][0]['primitives'])==1
 assert all(not any(k in n for k in ('matrix','translation','rotation','scale')) for n in g['nodes'])
 p=g['meshes'][0]['primitives'][0]; attrs=p['attributes']; pos=accessor(attrs['POSITION']); lower=pos.min(axis=0); upper=pos.max(axis=0); span=max(upper-lower)
 pos=(pos-np.array([(lower[0]+upper[0])/2,lower[1],(lower[2]+upper[2])/2]))/span
 data={}
 for key,arr,dtype in [('position',pos,'<f4'),('normal',accessor(attrs['NORMAL']),'<f4'),('uv',accessor(attrs['TEXCOORD_0']),'<f4'),('index',accessor(p['indices']),'<u4')]:
  data[key]=base64.b64encode(arr.astype(dtype).tobytes()).decode()
 data['source']=filename; data['triangles']=len(accessor(p['indices']))//3
 (out/(name+'.js')).write_text('module.exports='+json.dumps(data,separators=(',',':'))+';\n')
 mat=g['materials'][p['material']]; tx=mat['pbrMetallicRoughness']['baseColorTexture']['index']; im=g['images'][g['textures'][tx]['source']]; v=g['bufferViews'][im['bufferView']]; img=Image.open(io.BytesIO(binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']])).convert('RGB'); img.thumbnail((1024,1024)); img.save(out/(name+'.jpg'),quality=85,optimize=True)
 print(name,data['triangles'],'triangles',sum(f.stat().st_size for f in [out/(name+'.js'),out/(name+'.jpg')]),'bytes')
