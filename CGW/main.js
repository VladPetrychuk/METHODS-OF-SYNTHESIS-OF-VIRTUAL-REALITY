'use strict';

let gl;
let surface;
let shProgram;
let spaceball;
let reflection;
let incoming = []
let range = []

let showmyself;
let reflectionTexture;
let twoTriangles;
let texture;

let sphere;
let audio, audiosource, filterNow, highpassFilter, panner, context;

function deg2rad(angle) {
    return angle * Math.PI / 180;
}

function Model(name) {
    this.name = name;
    this.iVertexBuffer = gl.createBuffer();
    this.iTexCoordBuffer = gl.createBuffer();
    this.count = 0;

    this.BufferData = function (vertices, textures) {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textures), gl.STREAM_DRAW);

        this.count = vertices.length / 3;
    }

    this.Draw = function() {

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
        gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribVertex);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.iTexCoordBuffer);
        gl.vertexAttribPointer(shProgram.iAttribTexCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(shProgram.iAttribTexCoord);
        
        gl.drawArrays(gl.TRIANGLES, 0, this.count);
    }
}


function StereoCamera(
    Convergence,
    EyeSeparation,
    AspectRatio,
    FOV,
    NearClippingDistance,
    FarClippingDistance
) {
    this.mConvergence = Convergence;
    this.mEyeSeparation = EyeSeparation;
    this.mAspectRatio = AspectRatio;
    this.mFOV = FOV
    this.mNearClippingDistance = NearClippingDistance;
    this.mFarClippingDistance = FarClippingDistance;
    this.mProjectionMatrix;
    this.mModelViewMatrix;

    this.ApplyLeftFrustum = function () {
        let top, bottom, left, right;

        top = this.mNearClippingDistance * Math.tan(this.mFOV / 2);
        bottom = -top;

        const a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;

        const b = a - this.mEyeSeparation / 2;
        const c = a + this.mEyeSeparation / 2;

        left = -b * this.mNearClippingDistance / this.mConvergence;
        right = c * this.mNearClippingDistance / this.mConvergence;

        this.mProjectionMatrix = m4.frustum(left, right, bottom, top, this.mNearClippingDistance, this.mFarClippingDistance)
        this.mModelViewMatrix = m4.identity()

        m4.multiply(m4.translation(0.01 * this.mEyeSeparation / 2, 0.0, 0.0), this.mModelViewMatrix, this.mModelViewMatrix);
    }

    this.ApplyRightFrustum = function () {
        let top, bottom, left, right;

        top = this.mNearClippingDistance * Math.tan(this.mFOV / 2);
        bottom = -top;

        const a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;

        const b = a - this.mEyeSeparation / 2;
        const c = a + this.mEyeSeparation / 2;

        left = -c * this.mNearClippingDistance / this.mConvergence;
        right = b * this.mNearClippingDistance / this.mConvergence;

        this.mProjectionMatrix = m4.frustum(left, right, bottom, top, this.mNearClippingDistance, this.mFarClippingDistance)
        this.mModelViewMatrix = m4.identity()

        m4.multiply(m4.translation(-0.01 * this.mEyeSeparation / 2, 0.0, 0.0), this.mModelViewMatrix, this.mModelViewMatrix);
    }
}

function ShaderProgram(name, program) {

    this.name = name;
    this.prog = program;

    this.iAttribVertex = -1;
    this.iColor = -1;
    this.iModelViewProjectionMatrix = -1;

    this.Use = function() {
        gl.useProgram(this.prog);
    }
}

function draw() {
    gl.clearColor(0,0,0,1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    let projection = m4.orthographic(-3, 3, -3, 3, -3, 3);

    let modelView = spaceball.getViewMatrix();

    let rotateToPointZero = m4.axisRotation([0.707,0.707,0], 0.7);
    let translateToPointZero = m4.translation(0,0,-5);

    let matAccum0 = m4.multiply(rotateToPointZero, modelView );
    let matAccum1 = m4.multiply(translateToPointZero, matAccum0 );

    gl.uniform4fv(shProgram.iColor, [1, 1, 1, 1]);

    let modelViewProjection = m4.identity()
    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    gl.bindTexture(gl.TEXTURE_2D, reflectionTexture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        showmyself
    );
    twoTriangles.Draw()
    gl.clear(gl.DEPTH_BUFFER_BIT);

    const timeframe = 0.001 * Date.now();
    if (panner) {
        panner.setPosition(Math.cos(timeframe), Math.sin(timeframe)/2, 1);
    }
    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, m4.multiply(m4.identity(),
        m4.multiply(m4.translation(Math.cos(timeframe), Math.sin(timeframe)/2, 1), m4.scaling(1, 1, 1))));
    sphere.Draw();
    gl.clear(gl.DEPTH_BUFFER_BIT);

    modelViewProjection = m4.multiply(projection, matAccum1 );

    reflection.ApplyLeftFrustum()
    modelViewProjection = m4.multiply(reflection.mProjectionMatrix, m4.multiply(reflection.mModelViewMatrix, matAccum1));

    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);

    gl.colorMask(true, false, false, false);

    gl.bindTexture(gl.TEXTURE_2D, texture);

    surface.Draw();

    gl.clear(gl.DEPTH_BUFFER_BIT);

    reflection.ApplyRightFrustum()
    modelViewProjection = m4.multiply(reflection.mProjectionMatrix, m4.multiply(reflection.mModelViewMatrix, matAccum1));
    gl.uniformMatrix4fv(shProgram.iModelViewProjectionMatrix, false, modelViewProjection);
    gl.colorMask(false, true, true, false);
    surface.Draw();
    gl.colorMask(true, true, true, true);
}

function CreateSphereSurface(r = 0.1) {
    let vertexList = [];
    let lon = -Math.PI;
    let lat = -Math.PI * 0.5;
    while (lon < Math.PI) {
        while (lat < Math.PI * 0.5) {
            let v1 = surfaceForSphere(r, lon, lat);
            let v2 = surfaceForSphere(r, lon + 0.5, lat);
            let v3 = surfaceForSphere(r, lon, lat + 0.5);
            let v4 = surfaceForSphere(r, lon + 0.5, lat + 0.5);
            vertexList.push(v1.x, v1.y, v1.z);
            vertexList.push(v2.x, v2.y, v2.z);
            vertexList.push(v3.x, v3.y, v3.z);
            vertexList.push(v2.x, v2.y, v2.z);
            vertexList.push(v4.x, v4.y, v4.z);
            vertexList.push(v3.x, v3.y, v3.z);
            lat += 0.5;
        }
        lat = -Math.PI * 0.5
        lon += 0.5;
    }
    return vertexList;
}

function surfaceForSphere(r, u, v) {
    let x = r * Math.sin(u) * Math.cos(v);
    let y = r * Math.sin(u) * Math.sin(v);
    let z = r * Math.cos(u);
    return { x: x, y: y, z: z };
}

function getDerivative1(a, ω1, u1, v, delta) {
    let [x, y, z]  = creating(a, ω1, u1 + delta, v);
    let x0 = x / deg2rad(delta);
    let y0 = y / deg2rad(delta);
    let z0 = z / deg2rad(delta);
    return [x0,y0,z0];
}

function getDerivative2(a, ω1, u1, v, delta) {
    let [x, y, z] = creating(a, ω1, u1, v + delta);
    let x0 = x / deg2rad(delta);
    let y0 = y / deg2rad(delta);
    let z0 = z / deg2rad(delta);
    return [x0,y0,z0];
}

function CreateSurfaceData() {
    let a = 2;
    let p = 1;

    let normalsList =[];
    let vertexList = [];
    let vertexTexCoordList = [];

    let numSteps = 50;

    const uMin = -Math.PI;
    const uMax = Math.PI;
    const vMin = -2;
    const vMax = 0;
    let delta = 0.0001;

    for (let i = 0; i < numSteps; i++) {
        const u1 = uMin + (uMax - uMin) * (i / numSteps);
        const u2 = uMin + (uMax - uMin) * ((i + 1) / numSteps);

        for (let j = 0; j < numSteps; j++) {
            const v1 = vMin + (vMax - vMin) * (j / numSteps);
            const v2 = vMin + (vMax - vMin) * ((j + 1) / numSteps);

            let ω1 = p * u1;
            let [x1, y1, z1] = creating(a, ω1, u1, v1);
            let derivative1 = getDerivative1(a, ω1, u1, v1, delta);
            let derivative2 = getDerivative2(a, ω1, u1, v1, delta);
            let normal1 = m4.cross(derivative1,derivative2);

            let ω2 = p * u2;
            let [x2, y2, z2] = creating(a, ω2, u2, v1);
            derivative1 = getDerivative1(a, ω2, u2, v1, delta);
            derivative2 = getDerivative2(a, ω2, u2, v1, delta);
            let normal2 = m4.cross(derivative1,derivative2);

            ω1 = p * u1;
            let [x3, y3, z3] = creating(a, ω1, u1, v2);
            derivative1 = getDerivative1(a, ω1, u1, v2, delta);
            derivative2 = getDerivative2(a, ω1, u1, v2, delta);
            let normal3 = m4.cross(derivative1,derivative2);

            ω2 = p * u2;
            let [x4, y4, z4] = creating(a, ω2, u2, v2);
            derivative1 = getDerivative1(a, ω2, u2, v2, delta);
            derivative2 = getDerivative2(a, ω2, u2, v2, delta);
            let normal4 = m4.cross(derivative1,derivative2);

            vertexList.push(x1, y1, z1, x2, y2, z2, x3, y3, z3, x3, y3, z3, x2, y2, z2, x4, y4, z4);
            normalsList.push(normal1[0],normal1[1],normal1[2], normal2[0],normal2[1],normal2[2],normal3[0],
                normal3[1],normal3[2],normal3[0],normal3[1],normal3[2], normal2[0],normal2[1],normal2[2], normal4[0],normal4[1],normal4[2]);

            vertexTexCoordList.push(map(u1, -Math.PI, Math.PI, 0, 1), map(v1, -a, 0, 0, 1));
            vertexTexCoordList.push(map(u2, -Math.PI, Math.PI, 0, 1), map(v1, -a, 0, 0, 1));
            vertexTexCoordList.push(map(u1, -Math.PI, Math.PI, 0, 1), map(v2, -a, 0, 0, 1));
            vertexTexCoordList.push(map(u1, -Math.PI, Math.PI, 0, 1), map(v2, -a, 0, 0, 1));
            vertexTexCoordList.push(map(u2, -Math.PI, Math.PI, 0, 1), map(v1, -a, 0, 0, 1));
            vertexTexCoordList.push(map(u2, -Math.PI, Math.PI, 0, 1), map(v2, -a, 0, 0, 1));
        }
    }
    return [vertexList, vertexTexCoordList];
}

function map(value, a, b, c, d) {
    value = (value - a) / (b - a);
    return c + value * (d - c);
}

function creating(a, ω1, u1, v1){
    const x1 = (a + v1) * Math.cos(ω1) * Math.cos(u1);
    const y1 = (a + v1) * Math.cos(ω1) * Math.sin(u1);
    const z1 = (a + v1) * Math.sin(ω1);
    return [x1, y1, z1]
}

function animating() {
    draw()
    window.requestAnimationFrame(animating)
}

const radius = 0.1;
function getSphereVertex(long, lat) {
    return {
        x: radius * Math.cos(long) * Math.sin(lat),
        y: radius * Math.sin(long) * Math.sin(lat),
        z: radius * Math.cos(lat)
    }
}

function initGL() {
    let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource );

    shProgram = new ShaderProgram('Basic', prog);
    shProgram.Use();

    shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
    shProgram.iAttribTexCoord = gl.getAttribLocation(prog, "texture");
    shProgram.iModelViewProjectionMatrix = gl.getUniformLocation(prog, "ModelViewProjectionMatrix");
    shProgram.iColor = gl.getUniformLocation(prog, "color");

    reflection = new StereoCamera(parseFloat(incoming[3].value), parseFloat(incoming[0].value), 1, parseFloat(incoming[1].value), parseFloat(incoming[2].value), 50)

    surface = new Model('Surface');
    surface.BufferData(...CreateSurfaceData());

    twoTriangles = new Model('Two triangles');
    twoTriangles.BufferData(
        [-1, -1, 0, 1, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 1, 0],
        [1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0]
    )

    sphere = new Model('Surface2');
    sphere.BufferData(CreateSphereSurface(), new Array(CreateSphereSurface().length).fill(0))

    gl.enable(gl.DEPTH_TEST);
}

function createProgram(gl, vShader, fShader) {
    let vsh = gl.createShader( gl.VERTEX_SHADER );
    gl.shaderSource(vsh,vShader);
    gl.compileShader(vsh);
    if ( ! gl.getShaderParameter(vsh, gl.COMPILE_STATUS) ) {
        throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
     }
    let fsh = gl.createShader( gl.FRAGMENT_SHADER );
    gl.shaderSource(fsh, fShader);
    gl.compileShader(fsh);
    if ( ! gl.getShaderParameter(fsh, gl.COMPILE_STATUS) ) {
       throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
    }
    let prog = gl.createProgram();
    gl.attachShader(prog,vsh);
    gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS) ) {
       throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
    }
    return prog;
}

function init() {
    incoming.push(document.getElementById('es'))
    incoming.push(document.getElementById('fov'))
    incoming.push(document.getElementById('ncd'))
    incoming.push(document.getElementById('c'))
    range.push(document.getElementById('es1'))
    range.push(document.getElementById('fov1'))
    range.push(document.getElementById('ncd1'))
    range.push(document.getElementById('c1'))
    incoming.forEach((i, ind) => {
        i.onchange = (e) => {
            range[ind].innerHTML = i.value
            reflection.mEyeSeparation = parseFloat(incoming[0].value)
            reflection.mFOV = parseFloat(incoming[1].value)
            reflection.mNearClippingDistance = parseFloat(incoming[2].value)
            reflection.mConvergence = parseFloat(incoming[3].value)
            draw()
        }
    })

    let canvas;
    try {
        canvas = document.getElementById("webglcanvas");
        gl = canvas.getContext("webgl");

        showmyself = readCamera()
        reflectionTexture = CreateCameraTexture()
        if ( ! gl ) {
            throw "Browser does not support WebGL";
        }
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not get a WebGL graphics context.</p>";
        return;
    }
    try {
        initGL();
    }
    catch (e) {
        document.getElementById("canvas-holder").innerHTML =
            "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
        return;
    }

    spaceball = new TrackballRotator(canvas, draw, 0);
    
    texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const textureImage = new Image();
    textureImage.crossOrigin = 'anonymous';
    textureImage.src = "https://i.imgur.com/5m51MCo.jpg";
    textureImage.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            textureImage
        );
        draw()
    }

    animating();
}

function initAudio() {
    filterNow = document.getElementById('filterState');
    audio = document.getElementById('audioContext');

    audio.addEventListener('play', () => {
        if (!context) {
            context = new (window.AudioContext || window.webkitAudioContext)();
            audiosource = context.createMediaElementSource(audio);
            highpassFilter = context.createBiquadFilter();
            panner = context.createPanner();

            audiosource.connect(panner);
            panner.connect(highpassFilter);
            highpassFilter.connect(context.destination);

            highpassFilter.type = 'highpass';
            highpassFilter.Q.value = 1;
            highpassFilter.frequency.value = 350;

            context.resume();
        }
    });

    audio.addEventListener('pause', () => {
        context.suspend();
    });

    filterNow.addEventListener('change', function () {
        if (filterNow.checked) {
            panner.disconnect();
            panner.connect(highpassFilter);
            highpassFilter.connect(context.destination);
        } else {
            panner.disconnect();
            panner.connect(context.destination);
        }
    });

    audio.play();
}