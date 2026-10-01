# Plan de Fix: envMap / Cubemap Conflict en hero-river.js

## Problema
- `painted: 0` → todo negro
- Warning: `bindTexture: Texture previously bound to TEXTURE_2D cannot be bound now to TEXTURE_CUBE_MAP` — conflicto de unidades de textura entre `normalSampler` (TEXTURE_2D) y `envMap` (TEXTURE_CUBE_MAP) en la misma unidad
- `envMap` creada DESPUÉS del material → primer frame con `envMap = null`
- Shader usa `textureCube(envMap, R)` manual sin chunks `envmap` de Three.js

## Causa Raíz
Three.js ShaderMaterial maneja texturas automáticamente via `material.map`, `material.envMap`, etc. Al usar uniform manual `envMap` + `textureCube()`, Three.js no sabe que debe asignar la cubemap a una unidad TEXTURE_CUBE_MAP distinta de la 2D, y ambas terminan en la misma unidad → error GL.

## Solución: Usar API nativa de Three.js

### 1. Crear envMap ANTES del material
- Mover `updateSun()` / PMREM generation ANTES de crear `waterMaterial`
- Asignar `waterMaterial.envMap = envMap` (property nativa)

### 2. Shader: usar chunks envmap de Three.js
En fragment shader:
- Añadir `#include <envmap_pars_fragment>` en pars
- Añadir `#include <envmap_fragment>` en main
- Eliminar uniform `envMap` manual
- Eliminar `textureCube(envMap, R)` manual
- Three.js inyecta `envMap` + `reflectivity` + `refractionRatio` vía chunks

### 3. Material: `material.envMap = envMap` + `material.envMapIntensity = 0.35`
Three.js maneja binding a TEXTURE_CUBE_MAP automáticamente.

---

## Cambios Exactos

### Archivo: `/home/dandi/dinamica-maulina/static/js/hero-river.js`

#### Cambio 1: Reordenar initRiver() — envMap ANTES del material
```javascript
// Orden NUEVO en initRiver():
1. create riverGeom
2. create flowNormalMap
3. create Sky + PMREM → envMap (updateSun())
4. create waterMaterial con envMap
5. create riverMesh
6. createBanks, createSediment, lights, vegetation
```

#### Cambio 2: Fragment shader — usar chunks envmap
```glsl
// En pars_fragment:
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <envmap_pars_fragment>    // ← NUEVO

// En main():
#include <logdepthbuf_fragment>

// ... código existente ...

// REEMPLAZAR envReflection manual por:
#include <envmap_fragment>    // ← Three.js inyecta envMap reflection aquí

// ELIMINAR:
// uniform samplerCube envMap;
// vec3 R = reflect(V, Np);
// vec3 envReflection = textureCube(envMap, R).rgb * fresnel * 0.35 * (1.0 - depth * 0.3);

// USAR: envReflection ya disponible como `envMap` variable inyectada por chunk
```

#### Cambio 3: waterUniforms — eliminar envMap uniform
```javascript
const waterUniforms = {
  // ... existing uniforms ...
  // ELIMINAR: envMap: { value: envMap },
  // ELIMINAR: alpha: { value: 0.80 },  // alpha se maneja via material.transparent
};
```

#### Cambio 4: Material — usar property nativa
```javascript
const waterMaterial = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  vertexShader: riverVertexShader,
  fragmentShader: riverFragmentShader,
  transparent: true,
  side: THREE.DoubleSide,
  fog: false,
});

waterMaterial.envMap = envMap;
waterMaterial.envMapIntensity = 0.35;
```

#### Cambio 5: animate() — actualizar envMap si cambia
```javascript
if (riverMesh && riverMesh.material) {
  riverMesh.material.uniforms.time.value += delta;
  riverMesh.material.uniforms.sunDirection.value.copy(sun).normalize();
  // envMap se actualiza via property si se regenera
}
```

---

## Orden de Implementación

| Paso | Acción | Archivo/Línea aprox |
|------|--------|---------------------|
| 1 | Mover `updateSun()` + PMREM antes de `waterMaterial` | hero-river.js ~275-320 |
| 2 | Actualizar fragment shader: añadir chunks envmap, quitar manual | hero-river.js ~68-120 |
| 3 | Quitar `envMap` de `waterUniforms` | hero-river.js ~297-311 |
| 4 | Asignar `waterMaterial.envMap = envMap` + `envMapIntensity` | hero-river.js ~313-325 |
| 5 | Actualizar `animate()` para uniforms correctos | hero-river.js ~400-410 |
| 6 | Build + deploy + test | - |

---

## Verificación
- ✅ No warning `bindTexture TEXTURE_2D vs TEXTURE_CUBE_MAP`
- ✅ `painted > 0` en check (agua visible)
- ✅ Agua transparente (alpha 0.80), colores claros
- ✅ Reflejos sutiles de cielo/árboles
- ✅ Sin barreras en orillas (MeshLambertMaterial)
- ✅ Sin warnings GL `bindTexture`

---

## Estado de Implementación

- [ ] Paso 1: Reordenar initRiver (envMap antes de material)
- [ ] Paso 2: Fragment shader chunks envmap
- [ ] Paso 3: Quitar envMap uniform
- [ ] Paso 4: material.envMap + envMapIntensity
- [ ] Paso 5: animate() update
- [ ] Build + deploy
- [ ] Test + check visual