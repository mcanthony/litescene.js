// ******* CAMERA **************************

/**
* Camera that contains the info about a camera
* @class Camera
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/

function Camera(o)
{
	this.enabled = true;
	this.layers = 3;

	this.clear_color = true;
	this.clear_depth = true;

	this._type = Camera.PERSPECTIVE;

	//contain the eye, center, up if local space
	this._eye = vec3.fromValues(0,100, 100); //TODO: change to position
	this._center = vec3.fromValues(0,0,0);	//TODO: change to target
	this._up = vec3.fromValues(0,1,0);

	//in global coordinates
	this._global_eye = vec3.fromValues(0,100,100);
	this._global_center = vec3.fromValues(0,0,0);
	this._global_up = vec3.fromValues(0,1,0);
	this._global_front = vec3.fromValues(0,0,-1);

	//clipping planes
	this._near = 1;
	this._far = 1000;

	//orthographics planes (near and far took from ._near and ._far)
	this._ortho = new Float32Array([-1,1,-1,1]);

	this._aspect = 1.0; //must be one, otherwise it gets deformed, the final one used is in final_aspect
	this._fov = 45; //persp
	this._frustum_size = 50; //ortho
	this._final_aspect = 1.0; //the one used when computing the projection matrix

	//viewport in normalized coordinates: left, bottom, width, height
	this._viewport = new Float32Array([0,0,1,1]);
	this._viewport_in_pixels = vec4.create(); //viewport in screen coordinates

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of viewmatrix (used for local vectors)

	//lazy upload
	this._must_update_view_matrix = true;
	this._must_update_projection_matrix = true;

	//render to texture
	this.render_to_texture = false;
	this.texture_name = ""; //name
	this.texture_size = vec2.fromValues(0,0); //0 means same as screen
	this.texture_high = false;
	this.texture_clone = false; //this registers a clone of the texture used for rendering, to avoid rendering and reading of the same texture, but doubles the memory

	if(o) 
		this.configure(o);
	//this.updateMatrices(); //done by configure

	this._uniforms = {
		u_view: this._view_matrix,
		u_viewprojection: this._viewprojection_matrix,
		u_camera_eye: this._global_eye,
		u_camera_front: this._global_front,
		u_camera_planes: vec2.fromValues( this.near, this.far ),
		u_camera_perspective: vec3.create()
	};

	//LEvent.bind(this,"cameraEnabled", this.onCameraEnabled.bind(this));
}

Camera.icon = "mini-icon-camera.png";

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2; //orthographic adapted to aspect ratio of viewport
Camera.ORTHO2D = 3; //orthographic with manually defined left,right,top,bottom

Camera["@type"] = { type: "enum", values: { "perspective": Camera.PERSPECTIVE, "orthographic": Camera.ORTHOGRAPHIC, "ortho2D": Camera.ORTHO2D } };
Camera["@eye"] = { type: "position" };
Camera["@center"] = { type: "position" };
Camera["@texture_name"] = { type: "texture" };
Camera["@layers"] = { type: "layers" };

// used when rendering a cubemap to set the camera view direction
Camera.cubemap_camera_parameters = [
	{ dir: vec3.fromValues(1,0,0), 	up: vec3.fromValues(0,-1,0) }, //positive X
	{ dir: vec3.fromValues(-1,0,0), up: vec3.fromValues(0,-1,0) }, //negative X
	{ dir: vec3.fromValues(0,1,0), 	up: vec3.fromValues(0,0,1) }, //positive Y
	{ dir: vec3.fromValues(0,-1,0), up: vec3.fromValues(0,0,-1) }, //negative Y
	{ dir: vec3.fromValues(0,0,1), 	up: vec3.fromValues(0,-1,0) }, //positive Z
	{ dir: vec3.fromValues(0,0,-1), up: vec3.fromValues(0,-1,0) } //negative Z
];

Camera.prototype.getResources = function (res)
{
	//nothing to do, cameras dont use assets, althoug they could generate them
	return res;
}


/*
Camera.prototype.onCameraEnabled = function(e,options)
{
	if(this.flip_x)
		options.reverse_backfacing = !options.reverse_backfacing;
}
*/

/**
* Camera type, could be Camera.PERSPECTIVE or Camera.ORTHOGRAPHIC
* @property type {vec3}
* @default Camera.PERSPECTIVE;
*/
Object.defineProperty( Camera.prototype, "type", {
	get: function() {
		return this._type;
	},
	set: function(v) {
		if(	this._type != v)
		{
			this._must_update_view_matrix = true;
			this._must_update_projection_matrix = true;
		}
		this._type = v;
	}
});

/**
* The position of the camera (in local space, node space)
* @property eye {vec3}
* @default [0,100,100]
*/
Object.defineProperty( Camera.prototype, "eye", {
	get: function() {
		return this._eye;
	},
	set: function(v) {
		this._eye.set(v);
		this._must_update_view_matrix = true;
	}
});

/**
* The center where the camera points (in local space, node space)
* @property center {vec3}
* @default [0,0,0]
*/
Object.defineProperty( Camera.prototype, "center", {
	get: function() {
		return this._center;
	},
	set: function(v) {
		this._center.set(v);
		this._must_update_view_matrix = true;
	}
});

/**
* The up vector of the camera (in local space, node space)
* @property up {vec3}
* @default [0,1,0]
*/
Object.defineProperty( Camera.prototype, "up", {
	get: function() {
		return this._up;
	},
	set: function(v) {
		this._up.set(v);
		this._must_update_view_matrix = true;
	}
});

/**
* The near plane
* @property near {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "near", {
	get: function() {
		return this._near;
	},
	set: function(v) {
		if(	this._near != v)
			this._must_update_projection_matrix = true;
		this._near = v;
	}
});

/**
* The far plane
* @property far {number}
* @default 1000
*/
Object.defineProperty( Camera.prototype, "far", {
	get: function() {
		return this._far;
	},
	set: function(v) {
		if(	this._far != v)
			this._must_update_projection_matrix = true;
		this._far = v;
	}
});

/**
* The camera aspect ratio
* @property aspect {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "aspect", {
	get: function() {
		return this._aspect;
	},
	set: function(v) {
		if(	this._aspect != v)
			this._must_update_projection_matrix = true;
		this._aspect = v;
	}
});
/**
* The field of view in degrees
* @property fov {number}
* @default 45
*/
Object.defineProperty( Camera.prototype, "fov", {
	get: function() {
		return this._fov;
	},
	set: function(v) {
		if(	this._fov != v)
			this._must_update_projection_matrix = true;
		this._fov  = v;
	}
});

/**
* The frustum size when working in ORTHOGRAPHIC
* @property frustum_size {number}
* @default 50
*/

Object.defineProperty( Camera.prototype, "frustum_size", {
	get: function() {
		return this._frustum_size;
	},
	set: function(v) {
		if(	this._frustum_size != v)
		{
			this._must_update_view_matrix = true;
			this._must_update_projection_matrix = true;
		}
		this._frustum_size  = v;
	}
});

/**
* The viewport in normalized coordinates (left,bottom, width, height)
* @property viewport {vec4}
*/
Object.defineProperty( Camera.prototype, "viewport", {
	get: function() {
		return this._viewport;
	},
	set: function(v) {
		this._viewport.set(v);
	}
});

/**
* @property viewport_offset {vec2}
*/
Object.defineProperty( Camera.prototype, "viewport_offset", {
	get: function() {
		return this._viewport.subarray(0,2);
	},
	set: function(v) {
		this._viewport.set(v);
	},
	enumerable: false
});

/**
* @property viewport_size {vec2}
*/
Object.defineProperty( Camera.prototype, "viewport_size", {
	get: function() {
		return this._viewport.subarray(2,4);
	},
	set: function(v) {
		this._viewport.set(v,2);
	},
	enumerable: false
});

Camera.prototype.onAddedToNode = function(node)
{
	if(!node.camera)
		node.camera = this;
	LEvent.bind( node, "collectCameras", this.onCollectCameras, this );
}

Camera.prototype.onRemovedFromNode = function(node)
{
	if(node.camera == this)
		delete node.camera;

	if(this._texture) //free memory
	{
		this._texture = null;
		this._fbo = null;
		this._renderbuffer = null;

	}
}

Camera.prototype.isRenderedToTexture = function()
{
	return this.enabled && this.render_to_texture && this.texture_name;
}

Camera.prototype.onCollectCameras = function(e, cameras)
{
	if(!this.enabled)
		return;

	if(!this.isRenderedToTexture())
		cameras.push(this);
	else
		cameras.unshift(this); //put at the begining

	//in case we need to render to a texture this camera
	//not very fond of this part, but its more optimal
	if(this.render_to_texture && this.texture_name)
	{
		if(!this._binded_render_frame)
		{
			LEvent.bind(this, "beforeRenderFrame", this.startFBO, this );
			LEvent.bind(this, "afterRenderFrame", this.endFBO, this );
			this._binded_render_frame = true;
		}
	}
	else if( this._binded_render_frame )
	{
		LEvent.unbind(this, "beforeRenderFrame", this.startFBO, this );
		LEvent.unbind(this, "afterRenderFrame", this.endFBO, this );
	}
}

/**
* 
* @method lookAt
* @param {vec3} eye
* @param {vec3} center
* @param {vec3} up
*/
Camera.prototype.lookAt = function(eye,center,up)
{
	vec3.copy(this._eye, eye);
	vec3.copy(this._center, center);
	vec3.copy(this._up,up);
	this._must_update_view_matrix = true;
}

/**
* Update matrices according to the eye,center,up,fov,aspect,...
* @method updateMatrices
*/
Camera.prototype.updateMatrices = function()
{
	if(this.type == Camera.ORTHOGRAPHIC)
		mat4.ortho(this._projection_matrix, -this._frustum_size*this._final_aspect*0.5, this._frustum_size*this._final_aspect*0.5, -this._frustum_size*0.5, this._frustum_size*0.5, this._near, this._far);
	else if (this.type == Camera.ORTHO2D)
		mat4.ortho(this._projection_matrix, this._ortho[0], this._ortho[1], this._ortho[2], this._ortho[3], this._near, this._far);
	else
		mat4.perspective(this._projection_matrix, this._fov * DEG2RAD, this._final_aspect, this._near, this._far);

	//if (this.type != Camera.ORTHO2D)
	if(this._root && this._root._is_root) //in root node
		mat4.lookAt( this._view_matrix, this._eye, this._center, this._up );
	else
		mat4.lookAt( this._view_matrix, this.getEye(this._global_eye), this.getCenter(this._global_center), this.getUp(this._global_up) );

	/*
	if(this.flip_x) //used in reflections
	{
		//mat4.scale(this._projection_matrix,this._projection_matrix, [-1,1,1]);
	};
	*/
	//if(this._root && this._root.transform)

	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );

	this._must_update_view_matrix = false;
	this._must_update_projection_matrix = false;
}

/**
* returns the inverse of the viewmatrix
* @method getModelMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getModelMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._model_matrix );
}

/**
* returns the viewmatrix
* @method getViewMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getViewMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._view_matrix );
}

/**
* returns the projection matrix
* @method getProjectionMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_projection_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._projection_matrix );
}

/**
* returns the view projection matrix
* @method getViewProjectionMatrix
* @param {mat4} m optional output container
* @return {mat4} matrix
*/
Camera.prototype.getViewProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._must_update_view_matrix || this._must_update_projection_matrix)
		this.updateMatrices();
	return mat4.copy( m, this._viewprojection_matrix );
}

/**
* returns the model view projection matrix computed from a passed model
* @method getModelViewProjectionMatrix
* @param {mat4} model model matrix
* @param {mat4} out optional output container
* @return {mat4} matrix
*/
Camera.prototype.getModelViewProjectionMatrix = function(model, out)
{
	out = out || mat4.create();
	if(this._must_update_view_matrix || this._must_update_projection_matrix)
		this.updateMatrices();
	return mat4.multiply( out, this._viewprojection_matrix, model );
}

/**
* apply a transform to all the vectors (eye,center,up) using a matrix
* @method updateVectors
* @param {mat4} model matrix
*/
Camera.prototype.updateVectors = function(model)
{
	var front = vec3.subtract(vec3.create(), this._center, this._eye);
	var dist = vec3.length(front);
	this._eye = mat4.multiplyVec3(vec3.create(), model, vec3.create() );
	this._center = mat4.multiplyVec3(vec3.create(), model, vec3.fromValues(0,0,-dist));
	this._up = mat4.rotateVec3(vec3.create(), model, vec3.fromValues(0,1,0));
	this.updateMatrices();
}

/**
* transform a local coordinate to global coordinates
* @method getLocalPoint
* @param {vec3} v vector
* @param {vec3} dest
* @return {vec3} v in global coordinates
*/
Camera.prototype.getLocalPoint = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root && this._root.transform)
		mat4.multiply( temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.multiplyVec3(dest, temp, v );
}

/**
* rotate a local coordinate to global coordinates (skipping translation)
* @method getLocalVector
* @param {vec3} v vector
* @param {vec3} dest
* @return {vec3} v in global coordinates
*/

Camera.prototype.getLocalVector = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._must_update_view_matrix)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root && this._root.transform)
		mat4.multiply(temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.rotateVec3(dest, temp, v );
}

/**
* returns the eye (position of the camera) in global coordinates
* @method getEye
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getEye = function( out )
{
	out = out || vec3.create();
	out.set( this._eye );
	if(this._root && this._root.transform)
	{
		return this._root.transform.getGlobalPosition( out );
		//return mat4.multiplyVec3(eye, this._root.transform.getGlobalMatrixRef(), eye );
	}
	return out;
}


/**
* returns the center of the camera (position where the camera is pointing) in global coordinates
* @method getCenter
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getCenter = function( out )
{
	out = out || vec3.create();

	if(this._root && this._root.transform)
	{
		out[0] = out[1] = 0; out[2] = -1;
		return mat4.multiplyVec3(out, this._root.transform.getGlobalMatrixRef(), out );
	}

	out.set( this._center );
	return out;
}

/**
* returns the front vector of the camera
* @method getFront
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getFront = function( out )
{
	out = out || vec3.create();

	if(this._root && this._root.transform)
	{
		out[0] = out[1] = 0; out[2] = -1;
		return mat4.rotateVec3(out, this._root.transform.getGlobalMatrixRef(), out );
	}

	vec3.sub( out, this._center, this._eye ); 
	return vec3.normalize(out, out);
}

/**
* returns the up vector of the camera
* @method getUp
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getUp = function( out )
{
	out = out || vec3.create();
	out.set( this._up );

	if(this._root && this._root.transform)
	{
		return mat4.rotateVec3( out, this._root.transform.getGlobalMatrixRef(), out );
	}
	return out;
}

/**
* returns the top vector of the camera (different from up, this one is perpendicular to front and right)
* @method getTop
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getTop = function( out )
{
	out = out || vec3.create();
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	var right = vec3.cross( vec3.create(), this._up, front );
	var top = vec3.cross( out, front, right );
	vec3.normalize(top,top);
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( top, this._root.transform.getGlobalMatrixRef(), top );
	return top;
}

/**
* returns the right vector of the camera 
* @method getRight
* @param {vec3} out output vector [optional]
* @return {vec3} position in global coordinates
*/
Camera.prototype.getRight = function( out )
{
	out = out || vec3.create();
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	var right = vec3.cross( out, this._up, front );
	vec3.normalize(right,right);
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( right, this._root.transform.getGlobalMatrixRef(), right );
	return right;
}

//DEPRECATED: use property eye instead

Camera.prototype.setEye = function(v)
{
	this._eye.set( v );
	this._must_update_view_matrix = true;
}

Camera.prototype.setCenter = function(v)
{
	this._center.set( v );
	this._must_update_view_matrix = true;
}

/**
* set camera in perspective mode and sets the properties
* @method setPerspective
* @param {number} fov in degrees
* @param {number} aspect the aspect modifier (not the real final aspect, leave it to one)
* @param {number} near distance
* @param {number} far distance
*/
Camera.prototype.setPerspective = function( fov, aspect, near, far )
{
	this._fov = fov;
	this._aspect = aspect;
	this._near = near;
	this._far = far;
	this._type = Camera.PERSPECTIVE;
	this._must_update_projection_matrix = true;
}

/**
* set camera in orthographic mode and sets the planes
* @method setOrthographic
* @param {number} left
* @param {number} right
* @param {number} bottom
* @param {number} top
* @param {number} near
* @param {number} far
*/
Camera.prototype.setOrthographic = function( left,right, bottom,top, near, far )
{
	this._near = near;
	this._far = far;
	this._ortho.set([left,right,bottom,top]);
	this._type = Camera.ORTHO2D;
	this._must_update_projection_matrix = true;
}

/**
* moves the camera by adding the delta vector to center and eye
* @method move
* @param {vec3} delta
*/
Camera.prototype.move = function(v)
{
	vec3.add(this._center, this._center, v);
	vec3.add(this._eye, this._eye, v);
	this._must_update_view_matrix = true;
}

/**
* rotate the camera around its center
* @method rotate
* @param {number} angle_in_deg
* @param {vec3} axis
* @param {boolean} in_local_space allows to specify if the axis is in local space or global space
*/
Camera.prototype.rotate = function(angle_in_deg, axis, in_local_space)
{
	if(in_local_space)
		this.getLocalVector(axis, axis);

	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._center, this._eye );

	vec3.transformQuat(front, front, R );
	vec3.add(this._center, this._eye, front);
	this._must_update_view_matrix = true;
}

/**
* Rotates the camera eye around a center
* @method orbit
* @param {number} angle_in_deg
* @param {vec3} axis
* @param {vec3} center optional
*/
Camera.prototype.orbit = function(angle_in_deg, axis, center)
{
	center = center || this._center;
	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.transformQuat(front, front, R );
	vec3.add(this._eye, center, front);
	this._must_update_view_matrix = true;
}

//this is too similar to setDistanceToCenter, must be removed
Camera.prototype.orbitDistanceFactor = function(f, center)
{
	center = center || this._center;
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.scale(front, front, f);
	vec3.add(this._eye, center, front);
	this._must_update_view_matrix = true;
}

/**
* changes the distance between eye and center ( it could move the center or the eye, depending on the parameters )
* @method setDistanceToCenter
* @param {number} new_distance
* @param {boolean} move_eye if this is true it moves the eye closer, otherwise it moves the center closer to the eye
*/
Camera.prototype.setDistanceToCenter = function( new_distance, move_eye )
{
	if(this._root)
	{
		console.warn("cannot use setDistanceToCenter in a camera attached to a node");
		return;
	}

	var front = vec3.sub( vec3.create(), this._center, this._eye );
	var dist = vec3.length( front );
	if(move_eye)
		vec3.scaleAndAdd( this._eye, this._center, front, -new_distance / dist  );
	else
		vec3.scaleAndAdd( this._center, this._eye, front, new_distance / dist );
	this._must_update_view_matrix = true;
}

Camera.prototype.setOrientation = function(q, use_vr)
{
	var center = this.getCenter();
	var eye = this.getEye();
	var up = [0,1,0];

	var to_target = vec3.sub( vec3.create(), center, eye );
	var dist = vec3.length( to_target );

	var front = null;
	front = vec3.fromValues(0,0,-dist);

	if(use_vr)
	{
		vec3.rotateY( front, front, Math.PI * -0.5 );
		vec3.rotateY( up, up, Math.PI * -0.5 );
	}

	vec3.transformQuat(front, front, q);
	vec3.transformQuat(up, up, q);

	if(use_vr)
	{
		vec3.rotateY( front, front, Math.PI * 0.5 );
		vec3.rotateY( up, up, Math.PI * 0.5 );
	}

	this.center = vec3.add( vec3.create(), eye, front );
	this.up = up;

	this._must_update_view_matrix = true;
}

Camera.prototype.setEulerAngles = function(yaw,pitch,roll)
{
	var q = quat.create();
	quat.fromEuler(q, [yaw, pitch, roll] );
	this.setOrientation(q);
}

Camera.prototype.fromViewmatrix = function(mat)
{
	var M = mat4.invert( mat4.create(), mat );
	this.eye = vec3.transformMat4(vec3.create(),vec3.create(),M);
	this.center = vec3.transformMat4(vec3.create(),[0,0,-1],M);
	this.up = mat4.rotateVec3( vec3.create(), M, [0,1,0] );
	this._must_update_view_matrix = true;
}

/**
* Sets the viewport in pixels (using the gl.canvas as reference)
* @method setViewportInPixels
* @param {number} left
* @param {number} right
* @param {number} width
* @param {number} height
*/
Camera.prototype.setViewportInPixels = function(left,bottom,width,height)
{
	this._viewport[0] = left / gl.canvas.width;
	this._viewport[1] = bottom / gl.canvas.height;
	this._viewport[2] = width / gl.canvas.width;
	this._viewport[3] = height / gl.canvas.height;
}


/**
* Converts from 3D to 2D
* @method project
* @param {vec3} vec 3D position we want to proyect to 2D
* @param {vec4} [viewport=null] viewport info (if omited full canvas viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.project = function( vec, viewport, result, skip_reverse )
{
	result = result || vec3.create();

	viewport = this.getLocalViewport(viewport);

	if( this._must_update_view_matrix || this._must_update_projection_matrix )
		this.updateMatrices();

	//from https://github.com/hughsk/from-3d-to-2d/blob/master/index.js
	var m = this._viewprojection_matrix;

	vec3.project( result, vec, this._viewprojection_matrix, viewport );
	if(!skip_reverse)
		result[1] = viewport[3] - result[1] + viewport[1]*2; //why 2? no idea, but it works :(
	return result;
}

/**
* Converts from 2D to 3D
* @method unproject
* @param {vec3} vec 2D position we want to proyect to 3D
* @param {vec4} [viewport=null] viewport info (if omited full canvas viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.unproject = function( vec, viewport, result )
{
	viewport = this.getLocalViewport(viewport);
	if( this._must_update_view_matrix || this._must_update_projection_matrix )
		this.updateMatrices();
	return vec3.unproject(result || vec3.create(), vec, this._viewprojection_matrix, viewport );
}

/**
* returns the viewport in pixels applying the local camera viewport to the full viewport of the canvas
* @method getLocalViewport
* @param {vec4} [viewport=null] viewport info, otherwise the canvas dimensions will be used (not the current viewport)
* @param {vec4} [result=vec4] where to store the result, if omited it is created
* @return {vec4} the viewport info of the camera in pixels
*/
Camera.prototype.getLocalViewport = function( viewport, result )
{
	result = result || vec4.create();

	//if no viewport specified, use the full canvas viewport as reference
	if(!viewport)
	{
		result[0] = gl.canvas.width * this._viewport[0]; //asume starts in 0
		result[1] = gl.canvas.height * this._viewport[1]; //asume starts in 0
		result[2] = gl.canvas.width * this._viewport[2];
		result[3] = gl.canvas.height * this._viewport[3];
		return result;
	}

	//apply viewport
	result[0] = Math.floor(viewport[2] * this._viewport[0] + viewport[0]);
	result[1] = Math.floor(viewport[3] * this._viewport[1] + viewport[1]);
	result[2] = Math.ceil(viewport[2] * this._viewport[2]);
	result[3] = Math.ceil(viewport[3] * this._viewport[3]);
	return result;
}

/**
* given an x and y position, returns the ray {start, dir}
* @method getRayInPixel
* @param {number} x
* @param {number} y
* @param {vec4} viewport viewport coordinates (if omited full viewport is used)
* @param {boolean} skip_local_viewport ignore the local camera viewport configuration when computing the viewport
* @return {Object} {start:vec3, dir:vec3}
*/
Camera.prototype.getRayInPixel = function(x,y, viewport, skip_local_viewport )
{
	//apply camera viewport
	if(!skip_local_viewport)
		viewport = this.getLocalViewport( viewport, this._viewport_in_pixels );

	if( this._must_update_view_matrix || this._must_update_projection_matrix )
		this.updateMatrices();
	var eye = this.getEye();
	var pos = vec3.unproject(vec3.create(), [x,y,1], this._viewprojection_matrix, viewport );

	if(this.type == Camera.ORTHOGRAPHIC)
		eye = vec3.unproject(eye, [x,y,0], this._viewprojection_matrix, viewport );

	var dir = vec3.subtract( pos, pos, eye );
	vec3.normalize(dir, dir);
	return { start: eye, direction: dir };
}

/**
* Returns true if the 2D point (in screen space coordinates) is inside the camera viewport area
* @method isPointInCamera
* @param {number} x
* @param {number} y
* @param {vec4} viewport viewport coordinates (if omited full viewport is used)
* @return {boolean} 
*/
Camera.prototype.isPointInCamera = function( x, y, viewport )
{
	var v = this.getLocalViewport( viewport, this._viewport_in_pixels );
	if( x < v[0] || x > v[0] + v[2] ||
		y < v[1] || y > v[1] + v[3] )
		return false;
	return true;
}

Camera.prototype.configure = function(o)
{
	if(o.uid !== undefined) this.uid = o.uid;
	if(o.layers !== undefined) this.layers = o.layers;

	if(o.enabled !== undefined) this.enabled = o.enabled;
	if(o.type !== undefined) this._type = o.type;

	if(o.eye !== undefined) this._eye.set(o.eye);
	if(o.center !== undefined) this._center.set(o.center);
	if(o.up !== undefined) this._up.set(o.up);

	if(o.near !== undefined) this._near = o.near;
	if(o.far !== undefined) this._far = o.far;
	if(o.fov !== undefined) this._fov = o.fov;
	if(o.aspect !== undefined) this._aspect = o.aspect;
	if(o.final_aspect !== undefined) this._final_aspect = o.final_aspect;
	if(o.frustum_size !== undefined) this._frustum_size = o.frustum_size;
	if(o.viewport !== undefined) this._viewport.set( o.viewport );

	if(o.render_to_texture !== undefined) this.render_to_texture = o.render_to_texture;
	if(o.texture_name !== undefined) this.texture_name = o.texture_name;
	if(o.texture_size && o.texture_size.length == 2) this.texture_size.set(o.texture_size);
	if(o.texture_high !== undefined) this.texture_high = o.texture_high;
	if(o.texture_clone !== undefined) this.texture_clone = o.texture_clone;

	this.updateMatrices();
}

Camera.prototype.serialize = function()
{
	var o = {
		uid: this.uid,
		layers: this.layers,
		enabled: this.enabled,
		type: this._type,
		eye: vec3.toArray(this._eye),
		center: vec3.toArray(this._center),
		up: vec3.toArray(this._up),
		near: this._near,
		far: this._far,
		fov: this._fov,
		aspect: this._aspect,
		frustum_size: this._frustum_size,
		viewport: toArray( this._viewport ),
		render_to_texture: this.render_to_texture,
		texture_name: this.texture_name,
		texture_size:  toArray( this.texture_size ),
		texture_high: this.texture_high,
		texture_clone: this.texture_clone
	};

	//clone
	return o;
}

//Layer stuff
Camera.prototype.checkLayersVisibility = function( layers )
{
	return (this.layers & layers) !== 0;
}

Camera.prototype.getLayers = function()
{
	var r = [];
	for(var i = 0; i < 32; ++i)
	{
		if( this.layers & (1<<i) )
			r.push( this._root.scene.layer_names[i] || ("layer"+i) );
	}
	return r;
}

Camera.prototype.setLayer = function(num, value) 
{
	var f = 1<<num;
	this.layers = (this.layers & (~f));
	if(value)
		this.layers |= f;
}

Camera.prototype.isInLayer = function(num)
{
	return (this.layers & (1<<num)) !== 0;
}

//Mostly used for gizmos
Camera.prototype.getTransformMatrix = function( element )
{
	if( this._root && this._root.transform )
		return null; //use the node transform

	var p = null;
	if (element == "center")
		p = this._center;
	else
		p = this._eye;

	var T = mat4.create();
	mat4.setTranslation( T, p );
	return T;
}

Camera.prototype.applyTransformMatrix = function( matrix, center, element )
{
	if( this._root && this._root.transform )
		return false; //ignore transform

	var p = null;
	if (element == "center")
		p = this._center;
	else
		p = this._eye;

	mat4.multiplyVec3( p, matrix, p );
	return true;
}

//Rendering stuff ******************************************

//used when rendering to a texture
Camera.prototype.startFBO = function()
{
	if(!this.render_to_texture || !this.texture_name)
		return;

	var width = this.texture_size[0] || gl.canvas.width;
	var height = this.texture_size[1] || gl.canvas.height;
	var use_high_precision = this.texture_high;

	//Create texture
	var type = use_high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	if(!this._texture || this._texture.width != width || this._texture.height != height || this._texture.type != type)
	{
		var isPOT = (isPowerOfTwo(width) && isPowerOfTwo(height));
		this._texture = new GL.Texture( width, height, { format: gl.RGB, wrap: isPOT ? gl.REPEAT : gl.CLAMP_TO_EDGE, filter: isPOT ? gl.LINEAR : gl.NEAREST, type: type });
	}
	var texture = this._texture;

	//save old
	this._old_fbo = gl.getParameter( gl.FRAMEBUFFER_BINDING );
	if(!this._old_viewport)
		this._old_viewport = vec4.create();
	this._old_viewport.set( gl.viewport_data );

	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	gl.viewport(0, 0, width, height );
	LS.Renderer._full_viewport.set( [0,0,width,height] );
	LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (texture.width / texture.height); //sure?

	//depth renderbuffer
	var renderbuffer = this._renderbuffer = this._renderbuffer || gl.createRenderbuffer();
	if(renderbuffer.width != width || renderbuffer.height != height)
	{
		renderbuffer.width = width;
		renderbuffer.height = height;
	}
	gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer );
	gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.handler, 0);
	gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer );
}

Camera.prototype.endFBO = function()
{
	if(!this.render_to_texture || !this.texture_name)
		return;

	//restore
	gl.bindFramebuffer(gl.FRAMEBUFFER, this._old_fbo);
	LS.Renderer.global_aspect = 1.0;
	this._old_fbo = null;

	//generate mipmaps
	if ( gl.NEAREST_MIPMAP_NEAREST <= this._texture.minFilter && this._texture.minFilter <= gl.LINEAR_MIPMAP_LINEAR )
	{
		this._texture.bind(0);
		gl.generateMipmap( this._texture.texture_type );
	}

	var v = this._old_viewport;
	gl.viewport( v[0], v[1], v[2], v[3] );
	LS.Renderer._full_viewport.set( v );

	//save texture
	if(this.texture_name)
	{
		var texture = this._texture;
		//cloning the texture allows to use the same texture in the scene (but uses more memory)
		if(this.texture_clone)
		{
			if(!this._texture_clone || this._texture_clone.width != texture.width || this._texture_clone.height != texture.height || this._texture_clone.type != texture.type)
				this._texture_clone = new GL.Texture( texture.width, texture.height, { format: gl.RGB, filter: gl.LINEAR, type: texture.type });
			texture.copyTo( this._texture_clone );
			texture = this._texture_clone;
		}
		LS.ResourcesManager.registerResource( this.texture_name, texture );
	}
}

Camera.prototype.fillCameraShaderUniforms = function( scene )
{
	var uniforms = this._uniforms;
	uniforms.u_camera_planes[0] = this.near;
	uniforms.u_camera_planes[1] = this.far;
	if(this.type == Camera.PERSPECTIVE)
		uniforms.u_camera_perspective.set( [this.fov * DEG2RAD, 512 / Math.tan( this.fov * DEG2RAD ) ] );
	else
		uniforms.u_camera_perspective.set( [ this._frustum_size, 512 / this._frustum_size ] );
	uniforms.u_camera_perspective[2] = this._projection_matrix[5]; //[1][1]

	this.getEye( uniforms.u_camera_eye );
	this.getFront( uniforms.u_camera_front );

	return uniforms;
},

LS.registerComponent(Camera);
LS.Camera = Camera;