
function SpriteRenderer(o)
{
	this.texture = "";
	this.size = vec2.create();

	if(o)
		this.configure(o);
}

SpriteRenderer.icon = "mini-icon-teapot.png";

SpriteRenderer["@texture"] = { type:"texture" };

SpriteRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SpriteRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}


//MeshRenderer.prototype.getRenderInstance = function(options)
SpriteRenderer.prototype.onCollectInstances = function(e, instances)
{
	var node = this._root;
	if(!this._root) return;

	var mesh = this._mesh;
	if(!this._mesh)
	{
		this._mesh = GL.Mesh.plane();
		mesh = this._mesh;
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	//do not need to update
	if( this._root.transform )
		RI.setMatrix( this._root.transform._global_matrix );
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	RI.setMesh(mesh, gl.TRIANGLES);
	RI.material = this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();

	instances.push(RI);
}

//LS.registerComponent(SpriteRenderer);