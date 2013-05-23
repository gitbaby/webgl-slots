var RendererWebGL = (function() {

	function getShader(gl, id) {
		var shaderScript = document.getElementById(id);
		if (!shaderScript) {
			return null;
		}

		var str = '';
		var k = shaderScript.firstChild;
		while (k) {
			if (k.nodeType == 3) {
				str += k.textContent;
			}
			k = k.nextSibling;
		}

		var shader;
		if (shaderScript.type == 'x-shader/x-fragment') {
			shader = gl.createShader(gl.FRAGMENT_SHADER);
		} else if (shaderScript.type == 'x-shader/x-vertex') {
			shader = gl.createShader(gl.VERTEX_SHADER);
		} else {
			return null;
		}

		gl.shaderSource(shader, str);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			alert(gl.getShaderInfoLog(shader));
			return null;
		}

		return shader;
	}

	function initShaders(gl, fragmentShaderId, vertexShaderId) {
		var fragmentShader = getShader(gl, fragmentShaderId);
		var vertexShader = getShader(gl, vertexShaderId);

		var shaderProgram = gl.createProgram();
		gl.attachShader(shaderProgram, vertexShader);
		gl.attachShader(shaderProgram, fragmentShader);
		gl.linkProgram(shaderProgram);

		if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
			alert('Could not initialize shaders.');
		}

		gl.useProgram(shaderProgram);

		shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
		gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);

		shaderProgram.textureCoordAttribute = gl.getAttribLocation(shaderProgram, 'aTextureCoord');
		gl.enableVertexAttribArray(shaderProgram.textureCoordAttribute);

		shaderProgram.pMatrixUniform = gl.getUniformLocation(shaderProgram, 'uPMatrix');
		shaderProgram.mvMatrixUniform = gl.getUniformLocation(shaderProgram, 'uMVMatrix');
		shaderProgram.samplerUniform = gl.getUniformLocation(shaderProgram, 'uSampler');
		shaderProgram.alphaUniform = gl.getUniformLocation(shaderProgram, "uAlpha");

		return shaderProgram;
	}

	function initGlBuffers(gl, meshes) {
		var vertexPositionBuffers = [];
		var vertexIndexBuffers = [];
		var vertexTextureCoordBuffers = [];

		var nMeshes = meshes.length;
		var mesh, vertexPositionBuffer, vertexIndexBuffer, vertexTextureCoordBuffer;
		for (var m = 0; m < nMeshes; m++) {
			mesh = meshes[m];

			vertexPositionBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.vertices), gl.STATIC_DRAW);
			vertexPositionBuffer.itemSize = 3;
			vertexPositionBuffer.numItems = mesh.vertices.length / 3;
			vertexPositionBuffers.push(vertexPositionBuffer);

			vertexIndexBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vertexIndexBuffer);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);
			vertexIndexBuffer.itemSize = 1;
			vertexIndexBuffer.numItems = mesh.indices.length;
			vertexIndexBuffers.push(vertexIndexBuffer);

			vertexTextureCoordBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vertexTextureCoordBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.textureCoords), gl.STATIC_DRAW);
			vertexTextureCoordBuffer.itemSize = 2;
			vertexTextureCoordBuffer.numItems = mesh.textureCoords.length / 2;
			vertexTextureCoordBuffers.push(vertexTextureCoordBuffer);
		}

		return {
			vertexPositionBuffers: vertexPositionBuffers,
			vertexIndexBuffers: vertexIndexBuffers,
			vertexTextureCoordBuffers: vertexTextureCoordBuffers
		};
	}

	function handleLoadedTexture(gl, texture) {
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texture.image);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	function initTexture(gl, textureFileName, renderer) {
		var texture = gl.createTexture();
		texture.image = new Image();
		texture.image.onload = function() {
			handleLoadedTexture(gl, texture);
			renderer.needRedraw(true);
		};
		texture.image.src = textureFileName;
		return texture;
	}

	/*
	 * RendererWebGL constructor.
	 */
	return function(canvas, camera, fragmentShaderId, vertexShaderId) {

		var gl = canvas.getContext('experimental-webgl', {alpha: false});
		if (!gl) {
			throw 'WebGL is not available.';
		}
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.clearColor(1, 1, 1, 1);
		gl.enable(gl.DEPTH_TEST);

		var aspectRatio = canvas.width / canvas.height;

		var shaderProgram = initShaders(gl, fragmentShaderId, vertexShaderId);

		var glBuffers;
		this.initBuffers = function(meshes) {
			glBuffers = initGlBuffers(gl, meshes);
		};

		var texture;
		this.initTexture = function(textureFileName) {
			texture = initTexture(gl, textureFileName, this);
		};

		var usePerspective = true;
		this.usePerspective = function(value) {
			usePerspective = value;
		};

		var useBlending = false;
		this.useBlending = function(value) {
			useBlending = value;
		};

		var useCulling = true;
		this.useCulling = function(value) {
			useCulling = value;
		};

		var viewMatrix = mat4.create();
		var projectionMatrix = mat4.create();

		var needRedraw = false;
		this.needRedraw = function(value) {
			needRedraw = value;
		};

		this.drawScene = function(xMeshRotationAngles) {
			if (!needRedraw) {
				return;
			}
			if (usePerspective) {
				mat4.perspective(projectionMatrix, Util.degToRad(camera.fov), aspectRatio, 0.1, 10);
			} else {
				mat4.ortho(projectionMatrix, -aspectRatio * 1.5, aspectRatio * 1.5, -1.5, 1.5, 0.1, 10);
			}
			gl.uniformMatrix4fv(shaderProgram.pMatrixUniform, false, projectionMatrix);

			mat4.identity(viewMatrix);
			mat4.lookAt(viewMatrix, camera.eye, camera.center, camera.up);

			if (useBlending) {
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
				gl.uniform1f(shaderProgram.alphaUniform, 0.8);
			} else {
				gl.disable(gl.BLEND);
				gl.uniform1f(shaderProgram.alphaUniform, 1);
			}

			if (useCulling) {
				gl.enable(gl.CULL_FACE);
				gl.cullFace(gl.FRONT);
			} else {
				gl.disable(gl.CULL_FACE);
			}

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			var nMeshes = xMeshRotationAngles.length;
			var viewMatrixMesh, vertexPositionBuffer, vertexIndexBuffer, vertexTextureCoordBuffer;
			for (var m = nMeshes - 1; m >= 0; m--) {
				viewMatrixMesh = mat4.clone(viewMatrix);

				// Rotate around x axis
				mat4.rotate(viewMatrixMesh, viewMatrixMesh, Util.degToRad(xMeshRotationAngles[m]), [1, 0, 0]);

				vertexPositionBuffer = glBuffers.vertexPositionBuffers[m];
				gl.bindBuffer(gl.ARRAY_BUFFER, vertexPositionBuffer);
				gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, vertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

				vertexTextureCoordBuffer = glBuffers.vertexTextureCoordBuffers[m];
				gl.bindBuffer(gl.ARRAY_BUFFER, vertexTextureCoordBuffer);
				gl.vertexAttribPointer(shaderProgram.textureCoordAttribute, vertexTextureCoordBuffer.itemSize, gl.FLOAT, false, 0, 0);

				gl.activeTexture(gl.TEXTURE0);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.uniform1i(shaderProgram.samplerUniform, 0);

				vertexIndexBuffer = glBuffers.vertexIndexBuffers[m];
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vertexIndexBuffer);

				gl.uniformMatrix4fv(shaderProgram.mvMatrixUniform, false, viewMatrixMesh);

				gl.drawElements(gl.TRIANGLES, vertexIndexBuffer.numItems, gl.UNSIGNED_SHORT, 0);
			}
		};

	};

})();


var RendererCanvas = (function() {

	function initBuffers(meshes) {
		var triangleBuffer = [];
		var nMeshes = meshes.length;
		var mesh, triangles, indices, vertices, textureCoords, nIndices, i, index, a, b, c, at, bt, ct, center;
		for (var m = 0; m < nMeshes; m++) {
			mesh = meshes[m];
			triangles = [];
			indices = mesh.indices;
			vertices = mesh.vertices;
			textureCoords = mesh.textureCoords;
			nIndices = indices.length;
			for (i = 0; i < nIndices; i += 3) {
				index = indices[i] * 3;
				a = [vertices[index], vertices[index + 1], vertices[index + 2]];
				index = indices[i + 1] * 3;
				b = [vertices[index], vertices[index + 1], vertices[index + 2]];
				index = indices[i + 2] * 3;
				c = [vertices[index], vertices[index + 1], vertices[index + 2]];
				center = [
					(a[0] + b[0] + c[0]) / 3,
					(a[1] + b[1] + c[1]) / 3,
					(a[2] + b[2] + c[2]) / 3
				];
				index = indices[i] * 2;
				at = [textureCoords[index], textureCoords[index + 1]];
				index = indices[i + 1] * 2;
				bt = [textureCoords[index], textureCoords[index + 1]];
				index = indices[i + 2] * 2;
				ct = [textureCoords[index], textureCoords[index + 1]];
				triangles.push({
					a: a, b: b, c: c,
					center: center,
					textureCoords: {
						a: at, b: bt, c: ct,
					}
				});
			}
			triangleBuffer.push(triangles);
		}
		return triangleBuffer;
	}

	/*
	 * Prepares texture for later use.
	 */
	function handleLoadedTexture(texture, buffers, image) {
		// Baking texture for 1 mesh because all meshes are the same
		var triangles = buffers[0];
		var nTriangles = triangles.length - 2;

		var imageWidth = image.width;
		var imageHeight = image.height;
		var textureWidth = imageHeight * 2;
		var textureHeight = imageHeight / (nTriangles / 2);

		// Get source image data
		var imageCanvas = document.createElement('canvas');
		imageCanvas.width = imageWidth;
		imageCanvas.height = imageHeight;
		var imageContext = imageCanvas.getContext('2d');
		imageContext.drawImage(image, 0, 0, imageWidth, imageHeight);
		var imageData = imageContext.getImageData(0, 0, imageWidth, imageHeight).data;

		// Get destination texture image data
		var textureCanvas = document.createElement('canvas');
		textureCanvas.width = textureWidth;
		textureCanvas.height = textureHeight;
		var textureContext = textureCanvas.getContext('2d');
		textureContext.fillStyle = '#fff';
		textureContext.fillRect(0, 0, textureWidth, textureHeight);
		var textureDataObj = textureContext.getImageData(0, 0, textureWidth, textureHeight);
		var textureData = textureDataObj.data;

		var va, vb, vc, xa, ya, xb, yb, xc, yc, dxA, dyA, dxC, dyC;
		var x, y, yx, stepX, stepY, offsetY, srcX, srcY, srcPixel, dstPixel;
		for (var f = 0, offsetX = textureWidth - textureHeight; f < nTriangles; f++, offsetX -= textureHeight) {
			var triangle = triangles[f];

			if (f % 2 == 0) {
				va = triangle.textureCoords.c;
				vb = triangle.textureCoords.b;
				vc = triangle.textureCoords.a;
			} else {
				va = triangle.textureCoords.a;
				vb = triangle.textureCoords.c;
				vc = triangle.textureCoords.b;
			}

			xa = imageWidth - Math.round(va[0] * imageWidth);
			ya = Math.round(va[1] * imageHeight);
			xb = imageWidth - Math.round(vb[0] * imageWidth);
			yb = Math.round(vb[1] * imageHeight);
			xc = imageWidth - Math.round(vc[0] * imageWidth);
			yc = Math.round(vc[1] * imageHeight);

			dxA = xc - xb;
			dyA = yc - yb;
			dxC = xb - xa;
			dyC = yb - ya;

			for (y = textureHeight, yx = 0; y >= 0; y--, yx++) {
				stepY = (textureHeight - y) / textureHeight;
				offsetY = (textureHeight - y) * textureWidth * 4;
				for (x = textureHeight - yx; x >= 0; x--) {
					stepX = (yx + x) / textureHeight;
					srcX = Math.floor(xa + stepX * dxC + stepY * dxA);
					srcY = Math.floor(ya + stepX * dyC + stepY * dyA);
					srcPixel = (srcY * imageWidth + srcX) * 4;
					dstPixel = offsetY + (offsetX + yx + x) * 4;

					textureData[dstPixel] = imageData[srcPixel];
					textureData[dstPixel + 1] = imageData[srcPixel + 1];
					textureData[dstPixel + 2] = imageData[srcPixel + 2];
					// Alpha
					textureData[dstPixel + 3] = imageData[srcPixel + 3];
				}
			}
		}

		textureContext.putImageData(textureDataObj, 0, 0);
		textureContext.fillRect(0,0,0,0); // for Opera
		texture.canvas = textureCanvas;
	}

	function initTexture(textureFileName, buffers, renderer) {
		var texture = {};
		var image = new Image();
		image.onload = function() {
			handleLoadedTexture(texture, buffers, this);
			renderer.needRedraw(true);
		};
		image.src = textureFileName;
		return texture;
	}

	/*
	 * RendererCanvas constructor.
	 */
	return function(canvas, camera) {
		var context = canvas.getContext('2d');
		if (!context) {
			throw 'Canvas is not available.';
		}

		var offscreenCanvas = document.createElement('canvas');
		offscreenCanvas.width = canvas.width;
		offscreenCanvas.height = canvas.height;
		var offscreenContext = offscreenCanvas.getContext('2d');
		// Set beginning of coordinates to the center of canvas
		offscreenContext.translate(canvas.width/2, canvas.height/2);

		var canvasWidth = canvas.width;
		var canvasHeight = canvas.height;
		var aspectRatio = canvasWidth / canvasHeight;

		var buffers;
		this.initBuffers = function(meshes) {
			buffers = initBuffers(meshes);
		};

		var texture;
		this.initTexture = function(textureFileName) {
			texture = initTexture(textureFileName, buffers, this);
		};

		var usePerspective = true;
		this.usePerspective = function(value) {
			usePerspective = value;
		};

		var useBlending = false;
		this.useBlending = function(value) {
			useBlending = value;
		};

		var useCulling = true;
		this.useCulling = function(value) {
			useCulling = value;
		};

		var viewMatrix = mat4.create();

		function drawScene(context, xMeshRotationAngles) {
			mat4.identity(viewMatrix);
			mat4.lookAt(viewMatrix, camera.eye, camera.center, camera.up);

			var scale = canvasHeight / 3;
			mat4.scale(viewMatrix, viewMatrix, [scale, scale, scale]);

			context.clearRect(-canvasWidth/2, -canvasHeight/2, canvasWidth, canvasHeight);
			context.globalAlpha = useBlending ? 0.75 : 1;

			// Z-sort triangles
			var projectionTriangles = [];
			var nMeshes = xMeshRotationAngles.length;
			var viewMatrixMesh, triangles, nTriangles, t, triangle, a, b, c;
			for (var m = 0; m < nMeshes; m++) {
				viewMatrixMesh = mat4.clone(viewMatrix);

				// Rotate around x axis
				mat4.rotate(viewMatrixMesh, viewMatrixMesh, Util.degToRad(xMeshRotationAngles[m]), [1, 0, 0]);

				triangles = buffers[m];
				nTriangles = triangles.length;
				for (t = 0; t < nTriangles; t++) {
					triangle = triangles[t];
					a = projection(context, viewMatrixMesh, triangle.a);
					b = projection(context, viewMatrixMesh, triangle.b);
					c = projection(context, viewMatrixMesh, triangle.c);
					// Backface culling
					if (!useCulling || !(((c[1]-a[1])/(c[0]-a[0]) - (b[1]-a[1])/(b[0]-a[0]) <= 0) ^ (a[0] <= c[0] == a[0] > b[0]))) {
						projectionTriangles.push({
							a: a, b: b, c: c,
							center: projection(context, viewMatrixMesh, triangle.center),
							textureCoords: triangle.textureCoords,
							side: t
						});
					}
				}
			}
			projectionTriangles.sort(zSort);

			// Draw triangles
			var nProjectionTriangles = projectionTriangles.length;
			for (var pt = 0; pt < nProjectionTriangles; pt++) {
				drawTextureTriangle(context, projectionTriangles[pt]);
			}

		}

		function projection(context, viewMatrix, point) {
			var p = [];
			vec3.transformMat4(p, point, viewMatrix);
			if (usePerspective) {
				var factor = canvasWidth / (canvasWidth + p[2]);
				p[0] *= factor;
				p[1] *= factor;
			}
			return p;
		}

		function zSort(a, b) { 
			return b.center[2] - a.center[2];
		}

		var sqrt2d2 = Math.sqrt(2) / 2;

		/*
		 * Rotates and draws triangle image.
		 */
		function drawTextureTriangle(context, triangle) {
			var textureCanvas = texture.canvas;
			if (!textureCanvas) {
				return;
			}

			var xa = triangle.a[0];
			var ya = triangle.a[1];
			var xb = triangle.b[0];
			var yb = triangle.b[1];
			var xc = triangle.c[0];
			var yc = triangle.c[1];

			var A = vec2.distance(triangle.b, triangle.c);
			var B = vec2.distance(triangle.a, triangle.c);
			var C = vec2.distance(triangle.a, triangle.b);

			var AA = A * A, BB = B * B, CC = C * C;

			var angleB = Math.acos((AA + CC - BB) / (2 * A * C));
			if (isNaN(angleB)) {
				return;
			}

			var angleC = Math.acos((AA + BB - CC) / (2 * A * B));
			if (isNaN(angleC)) {
				return;
			}

			var skewX = angleB + angleC;
			if (skewX == 0) {
				return;
			}
			skewX -= Util.degToRad90;

			// Show reflection on the inner side of the mesh
			var front = ((yc-ya)/(xc-xa) - (yb-ya)/(xb-xa) <= 0) ^ (xa <= xc == xa > xb);
			if (!front) {
				skewX = Util.degToRad180 - skewX;
			}

			var triangleRotation = -Math.asin((yb - ya) / C);

			// Rotate the other way around if triangle is flipped
			if (xb > xa) {
				triangleRotation = Util.degToRad180 - triangleRotation;
			}

			var rotation = Util.degToRad45 + skewX * 0.5;

			var k = 1 / (Math.sin(rotation) * sqrt2d2);
			var scaleX = Math.cos(skewX) * k;
			var scaleY = (Math.sin(skewX) + 1) * k;

			context.save();

			// Clip bigger triangle to remove gaps between triangles
			var cxa = xa;
			var cya = ya;
			var cxb = xb;
			var cyb = yb;
			var cxc = xc;
			var cyc = yc;

			if (cxa < cxb && cxa < cxc) {
				cxa--;
			} else if (cxb < cxa && cxb < cxc) {
				cxb--;
			} else if (cxc < cxa && cxc < cxb) {
				cxc--;
			}
			if (cxa > cxb && cxa > cxc) {
				cxa++;
			} else if (cxb > cxa && cxb > cxc) {
				cxb++;
			} else if (cxc > cxa && cxc > cxb) {
				cxc++;
			}
			if (cya < cyb && cya < cyc) {
				cya--;
			} else if (cyb < cya && cyb < cyc) {
				cyb--;
			} else if (cyc < cya && cyc < cyb) {
				cyc--;
			}
			if (cya > cyb && cya > cyc) {
				cya++;
			} else if (cyb > cya && cyb > cyc) {
				cyb++;
			} else if (cyc > cya && cyc > cyb) {
				cyc++;
			}

			context.beginPath();
			context.moveTo(cxa, cya);
			context.lineTo(cxb, cyb);
			context.lineTo(cxc, cyc);
			context.closePath();
			context.clip();

			// Transform
			context.translate(xb, yb);
			context.rotate(triangleRotation + rotation);
			context.scale(scaleX, scaleY);
			context.rotate(-Util.degToRad45);

			var textureHeight = textureCanvas.height;
			var triangleScaleX = C / 2;
			var triangleScaleY = B / 2;

			context.drawImage(
				textureCanvas, 
				triangle.side * textureHeight, 0, textureHeight, textureHeight,
				0, 0, triangleScaleX, triangleScaleY
			);

			context.restore();
		}

		var needRedraw = false;
		this.needRedraw = function(value) {
			if (texture.canvas) {
				needRedraw = value;
			}
		};

		this.drawScene = function(xMeshRotationAngles) {
			if (needRedraw) {
				needRedraw = false;
				drawScene(offscreenContext, xMeshRotationAngles);
				context.fillStyle = '#fff';
				context.fillRect(0, 0, canvasWidth, canvasHeight);
				context.drawImage(offscreenCanvas, 0, 0);
			}
		};

	};

})();


var Camera = (function() {

	/*
	 * Camera constructor.
	 */
	return function() {

		this.fov = 45;
		this.eye = [0, 0, 4];
		this.center = [0, 0, 0];
		this.up = [0, 1, 0];

		this.negate = function() {
			vec3.negate(this.eye, this.eye);
			vec3.negate(this.center, this.center);
			vec3.negate(this.up, this.up);
		};

		/*
		 * Rotates camera around y axis.
		 */
		this.rotateY = function(angle) {
			var x = this.eye[0];
			var z = this.eye[2];
			var c = Math.cos(angle);
			var s = Math.sin(angle);
			this.eye[0] = x * c - z * s;
			this.eye[2] = x * s + z * c;
		};

	};

})();


var Solution = (function() {

	/*
	 * Generates cylinder mesh around x axis.
	 */
	function cylinder(nSides, x) {
		var y = 0;
		var z = 0;
		var radius = 1;
		var height = 0.5;
		var theta = 2 * Math.PI / nSides;
		var c = Math.cos(theta);
		var s = Math.sin(theta);
		var y2 = radius;
		var z2 = 0;
		var vertices = [];
		var indices = [];
		var textureCoords = [];
		var i1, i2, ty, y3;
		for (var side = 0; side <= nSides; side++) {
			vertices.push(x);
			vertices.push(y + y2);
			vertices.push(z + z2);
			vertices.push(x + height);
			vertices.push(y + y2);
			vertices.push(z + z2);
			i1 = side * 2;
			i2 = i1 >= nSides * 2 ? 0 : i1 + 2;
			indices.push(i1);
			indices.push(i1 + 1);
			indices.push(i2);
			indices.push(i2);
			indices.push(i1 + 1);
			indices.push(i2 + 1);
			ty = 1 - side / nSides;
			textureCoords.push(0);
			textureCoords.push(ty);
			textureCoords.push(1);
			textureCoords.push(ty);
			y3 = y2;
			y2 = c * y2 - s * z2;
			z2 = s * y3 + c * z2;
		}
		return {
			vertices: vertices,
			indices: indices,
			textureCoords: textureCoords
		};
	}

	function getRandomRotationAngles(nCylinders, nSides) {
		var angles = [];
		var side, angle;
		for (var cyl = 0; cyl < nCylinders; cyl++) {
			side = Math.floor((Math.random() * nSides) + 1);
			angle = (side * 360 + 180) / nSides;
			angles.push(angle);
		}
		return angles;
	}

	/*
	 * Solution constructor
	 */
	return function(canvasId, fragmentShaderId, vertexShaderId) {

		var nCylinders = 5;
		var nSides = 12;

		var camera, renderer, xCylinderRotationAngles;

		this.usePerspective = function(value) {
			renderer.usePerspective(value);
			renderer.needRedraw(true);
		};

		var spinUpLimit = 1.5 * 360 / nSides;
		var spinDownLimit = 360 + spinUpLimit * 2;
		var spinning = false;
		var elapsedMs, cylinderSpin;

		this.spin = function() {
			if (spinning) {
				return;
			}
			spinning = true;
			elapsedMs = 0;
			cylinderSpin = [];
			for (var cyl = 0; cyl < nCylinders; cyl++) {
				cylinderSpin.push(0);
			}
		};

		var movingCamera = false;
		var cameraAngle = 0;
		var cameraAngleLimits, cameraAngleDirection;

		this.showInnards = function(show) {
			renderer.useBlending(true);
			renderer.useCulling(false);
			movingCamera = true;
			cameraAngleLimits = [0, 45];
			cameraAngleDirection = show ? 1 : -1;
		};

		var lastTime = 0;

		function animate() {
			var now = new Date().getTime();
			if (lastTime > 0) {
				var deltaTime = now - lastTime;
				if (spinning) {
					elapsedMs += deltaTime;
					spinning = false;
					var spinStartOffsetMs, spin, angle;
					for (var cyl = 0; cyl < nCylinders; cyl++) {
						spinStartOffsetMs = cyl * 200;
						if (elapsedMs >= spinStartOffsetMs) {
							spin = cylinderSpin[cyl];
							if (spin < spinUpLimit) {
								// Spin up
								angle = 90 * deltaTime / 1000;
								if (angle + spin >= spinUpLimit) {
									angle = spinUpLimit - spin;
								}
								cylinderSpin[cyl] = spin + angle;
								xCylinderRotationAngles[cyl] -= angle;
								spinning = true;
							} else if (spin < spinDownLimit) {
								// Spin down
								angle = 270 * deltaTime / 1000;
								if (angle + spin >= spinDownLimit) {
									angle = spinDownLimit - spin;
								}
								cylinderSpin[cyl] = spin + angle;
								xCylinderRotationAngles[cyl] += angle;
								spinning = true;
							}
						}
					}
					renderer.needRedraw(true);
				}
				if (movingCamera) {
					var angle = cameraAngleDirection * 60 * deltaTime / 1000;
					if (cameraAngle + angle <= cameraAngleLimits[0]) {
						angle = cameraAngleLimits[0] - cameraAngle;
						movingCamera = false;
						renderer.useBlending(false);
						renderer.useCulling(true);
					} else if (cameraAngle + angle >= cameraAngleLimits[1]) {
						angle = cameraAngleLimits[1] - cameraAngle;
						movingCamera = false;
					}
					camera.rotateY(Util.degToRad(angle));
					cameraAngle += angle;
					renderer.needRedraw(true);
				}
			}
			lastTime = now;
		}

		function tick() {
			animate();
			renderer.drawScene(xCylinderRotationAngles);
			requestAnimFrame(tick);
		}

		this.start = function() {
			var canvas = document.getElementById(canvasId);
			camera = new Camera();
			try {
				renderer = new RendererWebGL(canvas, camera, fragmentShaderId, vertexShaderId);
			} catch(e) {
				camera.negate();
				renderer = new RendererCanvas(canvas, camera);
			}

			var meshes = [];
			for (var cyl = 0, x = -1.25; cyl < nCylinders; cyl++, x += 0.5) {
				meshes.push(cylinder(nSides, x));
			}
			renderer.initBuffers(meshes);

			renderer.initTexture('slots.jpg', nSides);

			xCylinderRotationAngles = getRandomRotationAngles(nCylinders, nSides);

			tick();
		};

	};

})();


/*
 * Cross browser requestAnimationFrame.
 */
window.requestAnimFrame = (function() {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function(callback) {
			window.setTimeout(callback, 1000/60);
		};
})();


var Util = function() {};

Util.degToRad = function(degrees) {
	return degrees * Math.PI / 180;
};

Util.degToRad45 = 45 * Math.PI / 180;
Util.degToRad90 = 90 * Math.PI / 180;
Util.degToRad180 = 180 * Math.PI / 180;
