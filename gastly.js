// ============================================
// GASTLY WEBGL APPLICATION
// ============================================

let gl;
let programInfo;
let buffers = {};
let animation = 'idle';
let time = 0;
let rotation = 0;


// Vertex Shader
const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec3 aVertexNormal;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    uniform mat4 uNormalMatrix;
    
    varying highp vec3 vNormal;
    varying highp vec3 vViewPos;

    void main() {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        
        vViewPos = (uModelViewMatrix * aVertexPosition).xyz;
        vNormal = (uNormalMatrix * vec4(aVertexNormal, 0.0)).xyz;
    }
`;

// Fragment Shader  
const fsSource = `
    precision mediump float;

    varying highp vec3 vNormal;
    varying highp vec3 vViewPos;

    uniform vec3 uLightPosition;
    uniform vec4 uObjectColor;
    uniform bool uIsGlowing;

    void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(-vViewPos);

        // fresnel effect (edge highlight)
        float fresnelPower = 1.0;
        float fresnel = pow(1.1 - dot(viewDir, normal), fresnelPower);
        vec3 fresnelColor = vec3(0.8, 0.2, 0.5);

        vec3 secondaryColor = vec3(0.9, 0.6, 0.8);
        float mixFactor = abs(normal.y) * 0.2 + abs(normal.x) * 0.2;
        vec3 baseColor = mix(uObjectColor.rgb, secondaryColor, mixFactor);

        vec3 lightDir = normalize(uLightPosition - vViewPos);
        float diff = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diff * vec3(0.85, 0.7, 0.8);

        vec3 finalColor;

        if (uIsGlowing) {
            finalColor = baseColor * 0.8 + fresnel * fresnelColor * 2.0;
            finalColor += diffuse * baseColor * 0.2; 
        } else {
            vec3 ambient = vec3(0.2, 0.05, 0.15);
            vec3 shadowColor = vec3(0.4, 0.1, 0.3);
            vec3 litColor = (ambient + diffuse) * baseColor;
            vec3 shadedColor = shadowColor * baseColor;
            finalColor = mix(shadedColor, litColor, diff);
            finalColor += fresnel * fresnelColor * 0.005;
        }
        
        gl_FragColor = vec4(finalColor, uObjectColor.a);
    }
`;

// ============================================
// MATRIX OPERATIONS LIBRARY
// ============================================

function createMat4() {
    return new Float32Array(16);
}

function identity(out) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
}

function perspective(out, fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy / 2);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
    return out;
}

function translate(out, a, v) {
    const x = v[0], y = v[1], z = v[2];
    if (out === a) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    }
    return out;
}

function rotateX(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    
    if (out !== a) {
        out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
}

function rotateY(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    
    if (out !== a) {
        out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
}

function rotateZ(out, a, rad) {
    const s = Math.sin(rad), c = Math.cos(rad);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    
    if (out !== a) {
        out[8] = a[8]; out[9] = a[9]; out[10] = a[10]; out[11] = a[11];
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
}

function scale(out, a, v) {
    const x = v[0], y = v[1], z = v[2];
    out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
    out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
    out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
    if (out !== a) {
        out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15];
    }
    return out;
}

function multiply(out, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
}

function invert(out, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) { return null; }
    det = 1.0 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
}

function transpose(out, a) {
    if (out === a) {
        const a01 = a[1], a02 = a[2], a03 = a[3];
        const a12 = a[6], a13 = a[7];
        const a23 = a[11];
        out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
        out[4] = a01; out[6] = a[9]; out[7] = a[13];
        out[8] = a02; out[9] = a12; out[11] = a[14];
        out[12] = a03; out[13] = a13; out[14] = a23;
    } else {
        out[0] = a[0]; out[1] = a[4]; out[2] = a[8]; out[3] = a[12];
        out[4] = a[1]; out[5] = a[5]; out[6] = a[9]; out[7] = a[13];
        out[8] = a[2]; out[9] = a[6]; out[10] = a[10]; out[11] = a[14];
        out[12] = a[3]; out[13] = a[7]; out[14] = a[11]; out[15] = a[15];
    }
    return out;
}

function copy(out, a) {
    out.set(a);
    return out;
}

// class for hierarchical transformations
class SceneNode {
    constructor(options = {}) {
        this.buffers = options.buffers || null;
        this.localTransform = options.localTransform || { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
        this.color = options.color || [1, 1, 1, 1];
        this.isGlowing = options.isGlowing || false;
        this.isTransparent = options.isTransparent || false;  
        this.children = [];
        this.parent = null;
    }

    addChild(child) {
        this.children.push(child);
        child.parent = this;
    }

    getLocalMatrix() {
        const m = createMat4();
        identity(m);
        translate(m, m, this.localTransform.position);
        rotateX(m, m, this.localTransform.rotation[0]);
        rotateY(m, m, this.localTransform.rotation[1]);
        rotateZ(m, m, this.localTransform.rotation[2]);
        scale(m, m, this.localTransform.scale);
        return m;
    }

    getWorldMatrix(parentWorldMatrix = null) {
        const localMatrix = this.getLocalMatrix();
        if (parentWorldMatrix) {
            const worldMatrix = createMat4();
            multiply(worldMatrix, parentWorldMatrix, localMatrix);
            return worldMatrix;
        }
        return localMatrix;
    }
}

function main() {
    const canvas = document.querySelector("#glcanvas");
    const gl = canvas.getContext("webgl");
    if (!gl) { alert("Unable to initialize WebGL."); return; }

    const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
    const programInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
            vertexNormal: gl.getAttribLocation(shaderProgram, 'aVertexNormal'),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
            modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
            normalMatrix: gl.getUniformLocation(shaderProgram, 'uNormalMatrix'),
            lightPosition: gl.getUniformLocation(shaderProgram, 'uLightPosition'),
            objectColor: gl.getUniformLocation(shaderProgram, 'uObjectColor'),
            isGlowing: gl.getUniformLocation(shaderProgram, 'uIsGlowing'),
        },
    };

    // geometries untuk Gastly
    const bodyGeometry = createSphere(1.0, 32, 32);
    const eyeGeometry = createEllipticParaboloid(0.3, 0.2, 0.15, 16, 12);
    const mouthGeometry = createMouthFromBezier(30);
    const pupilGeometry = createSphere(0.1, 12, 12)
    const fangGeometry = createCone(0.08, 0.3, 10);
    const gasAuraGeometry = createGasAura(20, 24);
    
    // geometries untuk environment (dari kode Gengar)
    const floorGeometry = createWavyPlane(40, 40, 50, 50);
    const crystalGeometry = createCrystal(3.0, 1.0, 6);

    // buffers
    const bodyBuffers = initBuffers(gl, bodyGeometry);
    const eyeBuffers = initBuffers(gl, eyeGeometry);
    const mouthBuffers = initBuffers(gl, mouthGeometry);
    const fangBuffers = initBuffers(gl, fangGeometry);
    const pupilBuffers = initBuffers(gl, pupilGeometry);
    const gasAuraBuffers = initBuffers(gl, gasAuraGeometry);
    const floorBuffers = initBuffers(gl, floorGeometry);
    const crystalBuffers = initBuffers(gl, crystalGeometry);

    const root = new SceneNode();

    // ============================================
    // ENVIRONMENT (dari kode Gengar)
    // ============================================

    // Floor
    const floorNode = new SceneNode({
        buffers: floorBuffers,
        localTransform: {
            position: [0, -2.1, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
        },
        color: [0.1, 0.05, 0.15, 1.0]
    });
    root.addChild(floorNode);

    // Crystals (dari kode Gengar)
    const glowingCrystalColor = [1.0, 0.4, 0.7, 1.0];
    const darkCrystalColor = [0.5, 0.1, 0.3, 1.0];

    function placeCluster(clusterPrefab, options) {
        const placerNode = new SceneNode({
            localTransform: {
                position: options.position,
                rotation: options.rotation,
                scale: options.scale
            }
        });
        const cluster = clusterPrefab({
            crystalBuffers,
            color: options.isGlowing ? glowingCrystalColor : darkCrystalColor,
            glowing: options.isGlowing,
        });
        placerNode.addChild(cluster);
        root.addChild(placerNode);
    }

    // Crystal clusters di sekitar Gastly
    placeCluster(createCrystalClusterA, {
        position: [-5, -2.0, -8],
        rotation: [0, 0.5, 0],
        scale: [1.2, 1.2, 1.2],
        isGlowing: true,
    });
    placeCluster(createCrystalClusterB, {
        position: [-10, -2.1, -2],
        rotation: [0, 1.2, 0],
        scale: [1.0, 1.5, 1.0],
        isGlowing: true,
    });
    placeCluster(createCrystalClusterB, {
        position: [6, -1.9, -6],
        rotation: [0, -0.8, 0],
        scale: [1.5, 1.8, 1.5],
        isGlowing: true,
    });
    placeCluster(createCrystalClusterA, {
        position: [11, -2.0, 0],
        rotation: [0, -1.5, 0],
        scale: [0.9, 1.1, 0.9],
        isGlowing: true,
    });
    placeCluster(createCrystalClusterB, {
        position: [2, -2.1, -15],
        rotation: [0, 0.1, 0],
        scale: [2.0, 2.5, 2.0],
        isGlowing: true,
    });

    // ============================================
    // GASTLY HIERARCHICAL STRUCTURE
    // ============================================

    // body - parent utama
    const body = new SceneNode({
        buffers: bodyBuffers,
        localTransform: { position: [0.0, 0.0, 0.0], rotation: [0.0, 0.0, 0.0], scale: [1.5, 1.5, 1.5] },
        color: [0., 0., 0., 0.9],
        isGlowing: false
    });
    root.addChild(body);
    
    const initialBodyScaleY = body.localTransform.scale[1];
    
    //mouth (children of body)
    const mouth = new SceneNode({
        buffers: mouthBuffers,
        localTransform: {
            position: [0, -0.2, 1],
            rotation: [0.2, 0.0, 0.0],
            scale: [0.6, 0.5 , 1.0]
        },
        color: [0.25, 0.0, 0.2, 2.0],
        isGlowing: false
    });
    body.addChild(mouth);

    //fang (children of mouth)
    const Leftfang = new SceneNode({
        buffers: fangBuffers,
        localTransform: {
            position: [-0.7, 0.05, -0.13],
            rotation: [Math.PI, 0.0, 0.0],
            scale: [1.5, 1.5 , 1.5]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    mouth.addChild(Leftfang);

    const Rightfang = new SceneNode({
        buffers: fangBuffers,
        localTransform: {
            position: [0.7, 0.05, -0.13],
            rotation: [Math.PI, 0.0, 0.0],
            scale: [1.5, 1.5 , 1.5]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    mouth.addChild(Rightfang);

    

    // Eyes (children of body)
    const leftEye = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [-0.6, 0.2, 0.95],
            rotation: [3, 0.0, 0.7],
            scale: [4, 4, 4]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    body.addChild(leftEye);

    const leftPupil = new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            position: [0.05, -0.04, -0.05],
            rotation: [3, 0.0, -0.7],
            scale: [0.1, 0.1, 0.1]
        },
        color: [0.05, 0.05, 0.15, 1.0],
        isGlowing: false
    });
    leftEye.addChild(leftPupil);


    const rightEye = new SceneNode({
        buffers: eyeBuffers,
        localTransform: {
            position: [0.6, 0.2, 0.95],
            rotation: [3, 0.0, -0.7],
            scale: [4, 4, 4]
        },
        color: [0.92, 0.92, 0.95, 1.0],
        isGlowing: false
    });
    body.addChild(rightEye);

    const rightPupil = new SceneNode({
        buffers: pupilBuffers,
        localTransform: {
            
            position: [-0.05, -0.04, -0.05],
            rotation: [3, 0.0, -0.7],
            scale: [0.1, 0.1, 0.1]
        },
        color: [0.05, 0.05, 0.15, 1.0],
        isGlowing: false
    });
    rightEye.addChild(rightPupil);

    // Gas aura di sekeliling Gastly
    const gasAuraNode = new SceneNode({
        buffers: gasAuraBuffers,
        localTransform: {
            position: [0.0, 0.5, 0.0],
            rotation: [0.0, 0.0, 0.0],
            scale: [2.0, 2.0, 2.0]
        },
        color: [0.52, 0.32, 0.62, 0.15],
        isGlowing: true,
        isTransparent: true
    });
    body.addChild(gasAuraNode);
    // Additional small gas particles
    for (let i = 0; i < 8; i++) {
        
        const gasParticle = new SceneNode({
            buffers: gasAuraBuffers,
            localTransform: {
                position: [
                    Math.sin(i * 0.8) * 2.5,
                    Math.cos(i * 1.2) * 1.5,
                    Math.sin(i * 0.6) * 2.0
                ],
                rotation: [0, i * 0.5, 0],
                scale: [0.2, 0.2, 0.2]
            },
            color: [0.52, 0.32, 0.62, 0.3],
            isGlowing: true,
            isTransparent: true
        });
        gasAuraNode.addChild(gasParticle);
    }

    // ============================================
    // CAMERA CONTROLS (dari kode Gengar)
    // ============================================

    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let cameraRotation = { x: 0.35, y: 0.05 };
    canvas.addEventListener('mousedown', (e) => { 
        isDragging = true; 
        previousMousePosition = { x: e.clientX, y: e.clientY }; 
    });
    canvas.addEventListener('mouseup', () => { isDragging = false; });
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        cameraRotation.y += deltaX * 0.01;
        cameraRotation.x += deltaY * 0.01;
        cameraRotation.x = Math.max(0.0, Math.min(Math.PI / 2, cameraRotation.x));  
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    // Setup controls UI
    setupControls();

    // ============================================
    // RENDER FUNCTION
    // ============================================

    function renderNode(node, parentWorldMatrix, viewMatrix) {
    const worldMatrix = node.getWorldMatrix(parentWorldMatrix);
    
    if (node.buffers) {
        // ✅ FIX BLENDING: Hanya enable untuk objek transparan
        if (node.isTransparent) {
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.disable(gl.BLEND);
        }
        
        const modelViewMatrix = createMat4();
        multiply(modelViewMatrix, viewMatrix, worldMatrix);
        
        gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
        
        const normalMatrix = createMat4();
        invert(normalMatrix, modelViewMatrix);
        transpose(normalMatrix, normalMatrix);
        gl.uniformMatrix4fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);
        
        gl.uniform4fv(programInfo.uniformLocations.objectColor, node.color);
        gl.uniform1i(programInfo.uniformLocations.isGlowing, node.isGlowing);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, node.buffers.position);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, node.buffers.normal);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
        
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, node.buffers.indices);
        gl.drawElements(gl.TRIANGLES, node.buffers.vertexCount, gl.UNSIGNED_SHORT, 0);
    }
    
    node.children.forEach(child => renderNode(child, worldMatrix, viewMatrix));
}

    function render(now) {
    now *= 0.001;
    time = now;

    // Animation parameters untuk Gastly - HANYA IDLE
    const breathSpeed = 0.5; 
    const breathAmount = 0.02;
    const breathScaleFactor = 1.0 + Math.sin(now * breathSpeed * 2 * Math.PI) * breathAmount;
    body.localTransform.scale[1] = initialBodyScaleY * breathScaleFactor;

    // Gas aura rotation
    const gasRotateSpeed = 0.5;
    gasAuraNode.localTransform.rotation[1] = now * gasRotateSpeed;

    // Small gas particles animation
    body.children.forEach((child, index) => {
        if (index > 3) { // Skip body, gasAura, dan eyes
            const particleTime = now + index * 0.5;
            child.localTransform.position[0] = Math.sin(particleTime * 2 + index) * 2.5;
            child.localTransform.position[1] = Math.cos(particleTime * 1.5 + index) * 1.5;
            child.localTransform.position[2] = Math.sin(particleTime * 1.8 + index) * 2.0;
            child.localTransform.rotation[1] = particleTime * 3;
            
            // Pulsating alpha
            const alphaPulse = 0.2 + Math.sin(particleTime * 4) * 0.1;
            child.color[3] = alphaPulse;
        }
    });

    // ✅ HANYA IDLE ANIMATION
    let eyeGlowIntensity = 0.3 + Math.sin(now * 4) * 0.2;
    body.localTransform.position[1] = Math.sin(now * 1.5) * 0.2;

    leftEye.isGlowing = eyeGlowIntensity > 0.5;
    rightEye.isGlowing = eyeGlowIntensity > 0.5;

    

    // Render setup
    resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.12, 0.05, 0.09, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    
    // Blending handling
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fieldOfView = 45 * Math.PI / 180;
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projectionMatrix = createMat4();
    perspective(projectionMatrix, fieldOfView, aspect, 0.1, 100.0);
    
    const viewMatrix = createMat4();
    identity(viewMatrix);
    const cameraPosition = [0.0, 0.0, 8.0];
    translate(viewMatrix, viewMatrix, [0.0, 0.0, -cameraPosition[2]]);
    rotateX(viewMatrix, viewMatrix, cameraRotation.x);
    rotateY(viewMatrix, viewMatrix, cameraRotation.y);
    
    gl.useProgram(programInfo.program);
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
    gl.uniform3fv(programInfo.uniformLocations.lightPosition, [5.0, 4.0, 7.0]);
    
    renderNode(root, null, viewMatrix);
    
    requestAnimationFrame(render);
}
    requestAnimationFrame(render);
}

function setupControls() {
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.innerHTML = `
        <button id="btnIdle" class="active">Idle</button>
    `;
    controls.style.cssText = `
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 100;
        background: rgba(0,0,0,0.7);
        padding: 10px;
        border-radius: 5px;
        font-family: Arial, sans-serif;
    `;
    document.body.appendChild(controls);
    
    const style = document.createElement('style');
    style.textContent = `
        .controls button {
            background: #4a2a5a;
            color: white;
            border: none;
            padding: 8px 16px;
            margin: 2px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
        }
        .controls button.active {
            background: #8a4ca8;
            box-shadow: 0 0 10px #8a4ca8;
        }
        .controls button:hover {
            background: #6a3a7a;
        }
    `;
    document.head.appendChild(style);

    document.getElementById('btnIdle').addEventListener('click', function() {
        setAnimation('idle', this);
    });
}

function setAnimation(newAnimation, button) {
    animation = newAnimation;
    document.querySelectorAll('.controls button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
}

function setAnimation(newAnimation, button) {
    animation = newAnimation;
    document.querySelectorAll('.controls button').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
}

// ============================================
// HELPER FUNCTIONS (dari kode Gengar)
// ============================================

function initShaderProgram(gl, vsSource, fsSource) { 
    const vertexShader=loadShader(gl, gl.VERTEX_SHADER, vsSource); 
    const fragmentShader=loadShader(gl, gl.FRAGMENT_SHADER, fsSource); 
    const shaderProgram=gl.createProgram(); 
    gl.attachShader(shaderProgram, vertexShader); 
    gl.attachShader(shaderProgram, fragmentShader); 
    gl.linkProgram(shaderProgram); 
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { 
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram)); 
        return null; 
    } 
    return shaderProgram; 
}

function loadShader(gl, type, source) { 
    const shader=gl.createShader(type); 
    gl.shaderSource(shader, source); 
    gl.compileShader(shader); 
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { 
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader)); 
        gl.deleteShader(shader); 
        return null; 
    } 
    return shader; 
}

function resizeCanvasToDisplaySize(canvas) { 
    const displayWidth=canvas.clientWidth; 
    const displayHeight=canvas.clientHeight; 
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) { 
        canvas.width=displayWidth; 
        canvas.height=displayHeight; 
        return true; 
    } 
    return false; 
}

function initBuffers(gl, geometry, usage = gl.STATIC_DRAW) { 
    const positionBuffer=gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.vertices), usage); 
    const normalBuffer=gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geometry.normals), usage); 
    const indexBuffer=gl.createBuffer(); 
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); 
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(geometry.indices), gl.STATIC_DRAW); 
    return { 
        position: positionBuffer, 
        normal: normalBuffer, 
        indices: indexBuffer, 
        vertexCount: geometry.indices.length, 
    }; 
}

// ============================================
// GEOMETRY FUNCTIONS
// ============================================

// 1. SPHERE untuk badan Gastly
function createSphere(radius, latBands, longBands) {
    const vertices = [];
    const normals = [];
    const indices = [];

    for (let lat = 0; lat <= latBands; lat++) {
        const theta = lat * Math.PI / latBands;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let long = 0; long <= longBands; long++) {
            const phi = long * 2 * Math.PI / longBands;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            const x = cosPhi * sinTheta;
            const y = cosTheta;
            const z = sinPhi * sinTheta;

            vertices.push(radius * x, radius * y, radius * z);
            normals.push(x, y, z);
        }
    }

    for (let lat = 0; lat < latBands; lat++) {
        for (let long = 0; long < longBands; long++) {
            const first = (lat * (longBands + 1)) + long;
            const second = first + longBands + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return { vertices, normals, indices };
}

// 2. ELLIPTIC PARABOLOID untuk mata Gastly
function createEllipticParaboloid(a, b, height, segments = 36, stacks = 24, sharpness = 1.0) {
    const vertices = [], normals = [], indices = [];
    const halfHeight = height / 2;
    const aEff = Math.max(1e-6, a / sharpness);
    const bEff = Math.max(1e-6, b / sharpness);
    vertices.push(0, halfHeight, 0);
    normals.push(0, 1, 0);
    for (let i = 1; i <= stacks; i++) {
        const v = i / stacks;
        const s = v * height;
        const y = halfHeight - s;
        const rX = aEff * Math.sqrt(s);
        const rZ = bEff * Math.sqrt(s);
        for (let j = 0; j <= segments; j++) {
            const angle = (j / segments) * Math.PI * 2;
            const x = rX * Math.cos(angle);
            const z = rZ * Math.sin(angle);
            vertices.push(x, y, z);
            const nx = 2 * x / (aEff * aEff);
            const ny = 1.0;
            const nz = 2 * z / (bEff * bEff);
            const len = Math.hypot(nx, ny, nz) || 1.0;
            normals.push(nx / len, ny / len, nz / len);
        }
    }
    const firstRingStart = 1;
    for (let j = 0; j < segments; j++) {
        indices.push(0, firstRingStart + j + 1, firstRingStart + j);
    }
    for (let i = 1; i < stacks; i++) {
        const ring1 = (i - 1) * (segments + 1) + 1;
        const ring2 = i * (segments + 1) + 1;
        for (let j = 0; j < segments; j++) {
            indices.push(ring1 + j, ring2 + j, ring1 + j + 1);
            indices.push(ring2 + j, ring2 + j + 1, ring1 + j + 1);
        }
    }
    return { vertices, normals, indices };
}
// 3. CONE untuk taring (QUADRIC OBJECT - bukan ellipsoid/cylinder)
function createCone(radius, height, segments) {
    const vertices = [];
    const normals = [];
    const indices = [];

    // Apex (puncak cone)
    vertices.push(0, height, 0);
    normals.push(0, 1, 0);

    // Base center
    const centerIdx = 1;
    vertices.push(0, 0, 0);
    normals.push(0, -1, 0);

    // Base vertices
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        
        vertices.push(x, 0, z);
        
        // Normal untuk sisi cone
        const sideLength = Math.sqrt(radius * radius + height * height);
        const nx = (height / sideLength) * Math.cos(angle);
        const ny = radius / sideLength;
        const nz = (height / sideLength) * Math.sin(angle);
        normals.push(nx, ny, nz);
    }

    // Side triangles (from apex)
    const baseStart = 2;
    for (let i = 0; i < segments; i++) {
        indices.push(0, baseStart + i, baseStart + i + 1);
    }

    // Bottom cap triangles
    for (let i = 0; i < segments; i++) {
        indices.push(centerIdx, baseStart + i + 1, baseStart + i);
    }

    return { vertices, normals, indices };
}

    // 4. MULUT dari BEZIER CURVE (KURVA 2D) - Wide Smile
    function createMouthFromBezier(segments) {
        const vertices = [];
        const normals = [];
        const indices = [];

        // Control points untuk wide smile Gastly (U terbalik lebar)
        const topCurve = [
            [-1, 0.1, -0.3],
            [-1, 0.1, 0.15],
            [1, 0.1, 0.15],
            [1.0, 0.1, -0.3]
        ];

        const bottomCurve = [
            [-1.0, 0.1, -0.26],
            [-0.2, -0.7, 0.1],
            [0.2, -0.7, 0.1],
            [1.0, 0.1, -0.26]
        ];

        // Cubic Bezier function
        function bezier(t, p0, p1, p2, p3) {
            const u = 1 - t;
            const tt = t * t;
            const uu = u * u;
            const uuu = uu * u;
            const ttt = tt * t;
            
            const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
            const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
            const z = uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2];
            
            return [x, y, z];
        }

        // Generate curves
        const topPoints = [];
        const bottomPoints = [];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            topPoints.push(bezier(t, topCurve[0], topCurve[1], topCurve[2], topCurve[3]));
            bottomPoints.push(bezier(t, bottomCurve[0], bottomCurve[1], bottomCurve[2], bottomCurve[3]));
        }

        // Create mesh
        const depth = 0.05;
        for (let i = 0; i <= segments; i++) {
            const top = topPoints[i];
            const bottom = bottomPoints[i];
            
            // Front vertices
            vertices.push(top[0], top[1], top[2]);
            normals.push(0, 0, 1);
            
            vertices.push(bottom[0], bottom[1], bottom[2]);
            normals.push(0, 0, 1);
            // const backOffset = 0.1; // Sedikit ke belakang dari Z asli
            // // Back vertices
            // positions.push(top[0], top[1], -top[2] - backOffset);
            // normals.push(0, 0, -1);
            
            // positions.push(bottom[0], bottom[1], -bottom[2] - backOffset);
            // normals.push(0, 0, -1);
        }

        // Generate indices
        for (let i = 0; i < segments; i++) {
            const base = i * 4;
            const next = (i + 1) * 4;
            
            // Front face
            indices.push(base, base + 1, next);
            indices.push(base + 1, next + 1, next);
            
            // Back face
            indices.push(base + 2, next + 2, base + 3);
            indices.push(base + 3, next + 2, next + 3);
        }

        return { vertices, normals, indices };
    }
// 3. GAS AURA untuk efek gas Gastly
function createGasAura(segments, rings) {
    const vertices = [];
    const normals = [];
    const indices = [];

    // Control points untuk profil gas mengelilingi sphere
    const profileControl = [
        [0.0, 0.4, 0.0],
        [0.8, 0.3, 0.8],
        [0.9, -0.7, 0.8],
        [0.4, -0.9, 0.4]
    ];

    // Cubic Bezier 3D
    function bezier3D(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const tt = t * t;
        const uu = u * u;
        const uuu = uu * u;
        const ttt = tt * t;
        
        const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
        const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
        const z = uuu * p0[2] + 3 * uu * t * p1[2] + 3 * u * tt * p2[2] + ttt * p3[2];
        
        return [x, y, z];
    }

    // Generate surface of revolution
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const profile = bezier3D(t, profileControl[0], profileControl[1], profileControl[2], profileControl[3]);
        
        const baseRadius = Math.abs(profile[0]);
        const yPos = profile[1];
        
        for (let j = 0; j <= rings; j++) {
            const angle = (j / rings) * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);
            
            // Organic variation
            const variation = Math.sin(t * Math.PI * 4 + angle * 3) * 0.1;
            const currentRadius = baseRadius + variation;
            
            const x = currentRadius * cosA;
            const y = yPos;
            const z = currentRadius * sinA;
            
            vertices.push(x, y, z);
            
            // Normal pointing outward
            const len = Math.sqrt(cosA * cosA + sinA * sinA + 0.09);
            normals.push(cosA / len, 0.3 / len, sinA / len);
        }
    }

    // Generate indices
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < rings; j++) {
            const first = i * (rings + 1) + j;
            const second = first + rings + 1;

            indices.push(first, second, first + 1);
            indices.push(second, second + 1, first + 1);
        }
    }

    return { vertices, normals, indices };
}

// ============================================
// ENVIRONMENT GEOMETRY (dari kode Gengar)
// ============================================

function createWavyPlane(width, height, widthSegments, heightSegments) {
    const vertices = [], normals = [], indices = [];
    const width_half = width / 2;
    const height_half = height / 2;
    const gridX = Math.floor(widthSegments);
    const gridZ = Math.floor(heightSegments);
    const segment_width = width / gridX;
    const segment_height = height / gridZ;

    // vertices n normals for grid
    for (let iz = 0; iz <= gridZ; iz++) {
        const z = iz * segment_height - height_half;
        for (let ix = 0; ix <= gridX; ix++) {
            const x = ix * segment_width - width_half;
            
            // wave effect
            const y = (Math.sin(x * 0.3) + Math.cos(z * 0.3)) * 0.3;
            vertices.push(x, y, z);
            
            const dYdX = 0.3 * Math.cos(x * 0.3);
            const dYdZ = -0.3 * Math.sin(z * 0.3);
            const normal = [-dYdX, 1, -dYdZ];
            const len = Math.hypot(...normal);
            normals.push(normal[0]/len, normal[1]/len, normal[2]/len);
        }
    }

    for (let iz = 0; iz < gridZ; iz++) {
        for (let ix = 0; ix < gridX; ix++) {
            const a = ix + (gridX + 1) * iz;
            const b = ix + 1 + (gridX + 1) * iz;
            const c = ix + (gridX + 1) * (iz + 1);
            const d = ix + 1 + (gridX + 1) * (iz + 1);
            indices.push(a, b, d);
            indices.push(a, d, c);
        }
    }
    return { vertices, normals, indices };
}

function createCrystal(height, radius, sides = 6) {
    const vertices = [];
    const normals = [];
    const indices = [];
    
    const apex = [0, height, 0];
    vertices.push(...apex);
    normals.push(0, 1, 0);

    const midHeight = height * 0.7;

    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * 2 * Math.PI;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        vertices.push(x, midHeight, z); // mid ring vertex
        vertices.push(x, 0, z);         // base ring vertex
    }

    for (let i = 0; i < sides; i++) {
        const angleMid = ((i + 0.5) / sides) * 2 * Math.PI;
        const nx = Math.cos(angleMid);
        const nz = Math.sin(angleMid);
        const ny = radius / (height - midHeight);
        let len = Math.hypot(nx, ny, nz);
        normals.push(nx/len, ny/len, nz/len); 
        normals.push(nx/len, ny/len, nz/len); 
    }

    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;

        const mid1 = 2 * i + 1;
        const base1 = 2 * i + 2;
        const mid2 = 2 * next + 1;
        const base2 = 2 * next + 2;

        indices.push(0, mid1, mid2);

        indices.push(mid1, base1, base2);
        indices.push(mid1, base2, mid2);
    }
    
    const baseCenterIndex = vertices.length / 3;
    vertices.push(0,0,0);
    normals.push(0,-1,0);
    for (let i = 0; i < sides; i++) {
        indices.push(baseCenterIndex, 2*((i+1)%sides)+2, 2*i+2);
    }

    return { vertices, normals, indices };
}

function createCrystalClusterA(options) {
    const { crystalBuffers, color, glowing } = options;
    const cluster = new SceneNode();

    // main
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0, 0, 0], rotation: [0, 0.2, 0], scale: [1, 1, 1] },
        color: color,
        isGlowing: glowing,
    }));

    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0.8, 0.1, 0.2], rotation: [0.3, -0.5, -0.4], scale: [0.4, 0.6, 0.4] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [-0.7, 0, 0.4], rotation: [-0.4, 0.8, 0.6], scale: [0.5, 0.7, 0.5] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0.8, 0.2, 0.2], rotation: [0.4, 0.2, -1.5], scale: [0.3, 0.5, 0.3] },
        color: color,
        isGlowing: glowing,
    }));

    return cluster;
}

function createCrystalClusterB(options) {
    const { crystalBuffers, color, glowing } = options;
    const cluster = new SceneNode();

    // main
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0, 0, 0], rotation: [0.1, -0.1, -0.1], scale: [0.6, 1.2, 0.6] },
        color: color,
        isGlowing: glowing,
    }));

    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [0.6, 0, 0.5], rotation: [-0.5, -0.8, -0.6], scale: [0.3, 0.4, 0.3] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [-0.2, 0, 0.7], rotation: [0.6, 2.5, -0.5], scale: [0.25, 0.5, 0.25] },
        color: color,
        isGlowing: glowing,
    }));
    cluster.addChild(new SceneNode({
        buffers: crystalBuffers,
        localTransform: { position: [-0.6, 0, -0.6], rotation: [0.5, -1.2, 0.8], scale: [0.4, 0.8, 0.4] },
        color: color,
        isGlowing: glowing,
    }));

    return cluster;
}

window.onload = main;
