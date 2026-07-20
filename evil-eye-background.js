const DEFAULTS = {
  eyeColor: "#fd2a00",
  intensity: 1.5,
  pupilSize: 0.6,
  irisWidth: 0.25,
  glowIntensity: 0.35,
  scale: 0.8,
  noiseScale: 1,
  pupilFollow: 1,
  flameSpeed: 1,
  backgroundColor: "#000000"
};

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uResolution;
uniform sampler2D uNoiseTexture;
uniform float uPupilSize;
uniform float uIrisWidth;
uniform float uGlowIntensity;
uniform float uIntensity;
uniform float uScale;
uniform float uNoiseScale;
uniform vec2 uMouse;
uniform float uPupilFollow;
uniform float uFlameSpeed;
uniform vec3 uEyeColor;
uniform vec3 uBgColor;

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
  uv /= uScale;
  float ft = uTime * uFlameSpeed;

  float polarRadius = length(uv) * 2.0;
  float polarAngle = (2.0 * atan(uv.x, uv.y)) / 6.28 * 0.3;
  vec2 polarUv = vec2(polarRadius, polarAngle);

  vec4 noiseA = texture2D(uNoiseTexture, polarUv * vec2(0.2, 7.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));
  vec4 noiseB = texture2D(uNoiseTexture, polarUv * vec2(0.3, 4.0) * uNoiseScale + vec2(-ft * 0.2, 0.0));
  vec4 noiseC = texture2D(uNoiseTexture, polarUv * vec2(0.1, 5.0) * uNoiseScale + vec2(-ft * 0.1, 0.0));

  float distanceMask = 1.0 - length(uv);

  float innerRing = clamp(-1.0 * ((distanceMask - 0.7) / uIrisWidth), 0.0, 1.0);
  innerRing = (innerRing * distanceMask - 0.2) / 0.28;
  innerRing += noiseA.r - 0.5;
  innerRing *= 1.3;
  innerRing = clamp(innerRing, 0.0, 1.0);

  float outerRing = clamp(-1.0 * ((distanceMask - 0.5) / 0.2), 0.0, 1.0);
  outerRing = (outerRing * distanceMask - 0.1) / 0.38;
  outerRing += noiseC.r - 0.5;
  outerRing *= 1.3;
  outerRing = clamp(outerRing, 0.0, 1.0);

  innerRing += outerRing;

  float innerEye = distanceMask - 0.1 * 2.0;
  innerEye *= noiseB.r * 2.0;

  vec2 pupilOffset = uMouse * uPupilFollow * 0.12;
  vec2 pupilUv = uv - pupilOffset;
  float pupil = 1.0 - length(pupilUv * vec2(9.0, 2.3));
  pupil *= uPupilSize;
  pupil = clamp(pupil, 0.0, 1.0);
  pupil /= 0.35;

  float outerEyeGlow = 1.0 - length(uv * vec2(0.5, 1.5));
  outerEyeGlow = clamp(outerEyeGlow + 0.5, 0.0, 1.0);
  outerEyeGlow += noiseC.r - 0.5;
  float outerBgGlow = outerEyeGlow;
  outerEyeGlow = pow(outerEyeGlow, 2.0);
  outerEyeGlow += distanceMask;
  outerEyeGlow *= uGlowIntensity;
  outerEyeGlow = clamp(outerEyeGlow, 0.0, 1.0);
  outerEyeGlow *= pow(1.0 - distanceMask, 2.0) * 2.5;

  outerBgGlow += distanceMask;
  outerBgGlow = pow(outerBgGlow, 0.5);
  outerBgGlow *= 0.15;

  vec3 color = uEyeColor * uIntensity * clamp(max(innerRing + innerEye, outerEyeGlow + outerBgGlow) - pupil, 0.0, 3.0);
  color += uBgColor;

  gl_FragColor = vec4(color, 1.0);
}
`;

function hexToVec3(hexColor) {
  const hex = hexColor.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  ];
}

function generateNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);

  function hash(x, y, seed) {
    let n = x * 374761393 + y * 668265263 + seed * 1274126177;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function noise(px, py, freq, seed) {
    const fx = (px / size) * freq;
    const fy = (py / size) * freq;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const w = freq | 0;
    const v00 = hash(((ix % w) + w) % w, ((iy % w) + w) % w, seed);
    const v10 = hash((((ix + 1) % w) + w) % w, ((iy % w) + w) % w, seed);
    const v01 = hash(((ix % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
    const v11 = hash((((ix + 1) % w) + w) % w, (((iy + 1) % w) + w) % w, seed);
    return v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) + v01 * (1 - tx) * ty + v11 * tx * ty;
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = 0;
      let amp = 0.4;
      let totalAmp = 0;

      for (let octave = 0; octave < 8; octave += 1) {
        const freq = 32 * (1 << octave);
        value += amp * noise(x, y, freq, octave * 31);
        totalAmp += amp;
        amp *= 0.65;
      }

      value /= totalAmp;
      value = (value - 0.5) * 2.2 + 0.5;
      value = Math.max(0, Math.min(1, value));

      const color = Math.round(value * 255);
      const idx = (y * size + x) * 4;
      data[idx] = color;
      data[idx + 1] = color;
      data[idx + 2] = color;
      data[idx + 3] = 255;
    }
  }

  return data;
}

async function loadOgl() {
  try {
    return await import("./node_modules/ogl/src/index.js");
  } catch (localError) {
    return import("https://esm.sh/ogl@1.0.11?bundle");
  }
}

function mountEvilEye(container, oglLib, options = {}) {
  const { Renderer, Program, Mesh, Triangle, Texture } = oglLib;
  const settings = { ...DEFAULTS, ...options };
  const renderer = new Renderer({ alpha: true, premultipliedAlpha: false });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  const noiseTexture = new Texture(gl, {
    image: generateNoiseTexture(256),
    width: 256,
    height: 256,
    generateMipmaps: false,
    flipY: false
  });
  noiseTexture.minFilter = gl.LINEAR;
  noiseTexture.magFilter = gl.LINEAR;
  noiseTexture.wrapS = gl.REPEAT;
  noiseTexture.wrapT = gl.REPEAT;

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex: vertexShader,
    fragment: fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uResolution: { value: [1, 1, 1] },
      uNoiseTexture: { value: noiseTexture },
      uPupilSize: { value: settings.pupilSize },
      uIrisWidth: { value: settings.irisWidth },
      uGlowIntensity: { value: settings.glowIntensity },
      uIntensity: { value: settings.intensity },
      uScale: { value: settings.scale },
      uNoiseScale: { value: settings.noiseScale },
      uMouse: { value: [0, 0] },
      uPupilFollow: { value: settings.pupilFollow },
      uFlameSpeed: { value: settings.flameSpeed },
      uEyeColor: { value: hexToVec3(settings.eyeColor) },
      uBgColor: { value: hexToVec3(settings.backgroundColor) }
    }
  });

  const mesh = new Mesh(gl, { geometry, program });
  container.appendChild(gl.canvas);

  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let frameId = null;

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [
      gl.canvas.width,
      gl.canvas.height,
      gl.canvas.width / gl.canvas.height
    ];
  };

  const onMouseMove = (event) => {
    const rect = container.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    mouse.tx = x * 2 - 1;
    mouse.ty = -(y * 2 - 1);
  };

  const onMouseLeave = () => {
    mouse.tx = 0;
    mouse.ty = 0;
  };

  const onTouchMove = (event) => {
    if (!event.touches || event.touches.length === 0) return;
    const touch = event.touches[0];
    onMouseMove(touch);
  };

  const animate = (time) => {
    frameId = requestAnimationFrame(animate);
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    program.uniforms.uMouse.value = [mouse.x, mouse.y];
    program.uniforms.uTime.value = time * 0.001;
    renderer.render({ scene: mesh });
  };

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("mouseleave", onMouseLeave);
  window.addEventListener("blur", onMouseLeave);

  resize();
  frameId = requestAnimationFrame(animate);

  return () => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
    }
    window.removeEventListener("resize", resize);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("mouseleave", onMouseLeave);
    window.removeEventListener("blur", onMouseLeave);
    if (gl.canvas.parentNode === container) {
      container.removeChild(gl.canvas);
    }
    const loseContext = gl.getExtension("WEBGL_lose_context");
    if (loseContext) loseContext.loseContext();
  };
}

async function initEvilEyeBackground() {
  const container = document.getElementById("evil-eye-background");
  if (!container) return;

  try {
    const oglLib = await loadOgl();
    mountEvilEye(container, oglLib, DEFAULTS);
  } catch (error) {
    console.error("EvilEye background failed to initialize:", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEvilEyeBackground, { once: true });
} else {
  initEvilEyeBackground();
}
