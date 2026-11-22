"""Cobertura real de contexto: NOAA DEM Global Mosaic, 2 km; detalle IGN del Camino.
Uso: python tools/mapa3d/preparar_europa_camino.py --dem /ruta/noaa-europa.tif
La app sólo recibe caminoSantiago.horneado.js; esta grilla se usa al hornear.
"""
import argparse,base64,gzip,json,math
from pathlib import Path
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates,distance_transform_edt
from matplotlib.path import Path as PolygonPath

RAIZ=Path(__file__).resolve().parents[2]
APP=RAIZ/'mobile'
DATOS=RAIZ/'tools/mapa3d/datos'
URL='https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_global_mosaic/ImageServer'

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--dem',type=Path,required=True);args=parser.parse_args()
 im=Image.open(args.dem);dem=np.array(im,dtype=np.float32)
 dx,dy,_=im.tag_v2[33550];_,_,_,lon0,lat0,_=im.tag_v2[33922]
 if not np.isfinite(dem).all() or (dem < -20000).any():raise ValueError('NOAA: celdas sin datos')
 kmLon=111.2*math.cos(math.radians(42.7));paso=2.;minX=-1220.;minZ=-1200.
 xs=np.arange(minX,1400.1,paso);zs=np.arange(minZ,1200.1,paso);X,Z=np.meshgrid(xs,zs)
 lon=-4.9+X/kmLon;lat=42.7-Z/111.2
 fi=(lon-lon0)/dx-.5;fj=(lat0-lat)/dy-.5
 if fi.min()<0 or fj.min()<0 or fi.max()>dem.shape[1]-1 or fj.max()>dem.shape[0]-1:raise ValueError('El recorte NOAA no cubre el contexto')
 alturas=np.round(map_coordinates(dem,[fj,fi],order=1,mode='nearest')).astype('<i2')
 meta=json.loads((APP/'scripts/mapa3d/caminoSantiago.relieve.json').read_text());nx,nz=meta['nx'],meta['nz']
 ox=meta['minX']+np.arange(nx)*meta['pasoKm'];oz=meta['minZ']+np.arange(nz)*meta['pasoKm'];OX,OZ=np.meshgrid(ox,oz)
 pts=np.column_stack([(-4.9+OX/kmLon).ravel(),(42.7-OZ/111.2).ravel()]);espana=np.zeros(len(pts),bool)
 datos=json.load(gzip.open(DATOS/'regiones-espana-ne10m.geojson.gz','rt'))
 for f in datos['features']:
  g=f['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
  for poly in polys:
   dentro=PolygonPath(np.asarray(poly[0])[:,:2]).contains_points(pts)
   for hole in poly[1:]:dentro &= ~PolygonPath(np.asarray(hole)[:,:2]).contains_points(pts)
   espana |= dentro
 def smooth(v):v=np.clip(v,0,1);return v*v*(3-2*v)
 pais=smooth(1-distance_transform_edt(~espana.reshape(nz,nx))/20)
 # Protege toda la ruta y sus monumentos: el muestreo denso sigue idéntico.
 # Consulta la ruta aprobada a través de Node; no evalúa texto en Python.
 import subprocess
 ruta=json.loads(subprocess.check_output(['node','-e',"console.log(JSON.stringify(require('./mobile/services/mapa3d/escenas/caminoSantiago').ruta))"],cwd=RAIZ,text=True))
 mascara=np.zeros((nz,nx),bool)
 for p in ruta:
  i=round(((p['lon']+4.9)*kmLon-meta['minX'])/meta['pasoKm']);j=round((-(p['lat']-42.7)*111.2-meta['minZ'])/meta['pasoKm'])
  if 0<=i<nx and 0<=j<nz:mascara[j,i]=True
 corredor=smooth((35-distance_transform_edt(~mascara))/15)
 margen=np.minimum(np.minimum(OX-ox[0],ox[-1]-OX),np.minimum(OZ-oz[0],oz[-1]-OZ))
 pesos=np.round(np.maximum(pais,corredor)*smooth(margen/35)*255).astype('uint8')
 detalle={'nx':nx,'nz':nz,'minX':float(ox[0]),'minZ':float(oz[0]),'pasoKm':meta['pasoKm'],'pesosIGN':base64.b64encode(pesos.tobytes()).decode()}
 out={'fuente':{'servicio':URL,'descripcion':'NOAA DEM Global Mosaic (elevación y batimetría), resampleado bilinealmente a 2 km','bboxExportada':[-20,24,18,62],'tifPixeles':[dem.shape[1],dem.shape[0]],'detalle':'IGN MDT500 en España y corredor del Camino; mezcla geográfica gradual hacia NOAA'},'minX':minX,'minZ':minZ,'pasoKm':paso,'nx':len(xs),'nz':len(zs),'alturas':base64.b64encode(alturas.tobytes()).decode(),'detalle':detalle}
 dest=APP/'scripts/mapa3d/caminoSantiago.europa.json';dest.write_text(json.dumps(out,separators=(',',':'))+'\n');print('Europa:',len(xs),'x',len(zs),'altitud:',int(alturas.min()),int(alturas.max()))
if __name__=='__main__':main()
