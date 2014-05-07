/**
* The SceneTree contains all the info about the Scene and nodes
*
* @class SceneTree
* @constructor
*/

function SceneTree()
{
	this._uid = LS.generateUId();

	this._root = new LS.SceneNode("root");
	this._root.removeAllComponents();
	this._root._is_root  = true;
	this._root._in_tree = this;
	this._nodes = [ this._root ];
	this._nodes_by_id = {"root":this._root};

	LEvent.bind(this,"treeItemAdded", this.onNodeAdded.bind(this));
	LEvent.bind(this,"treeItemRemoved", this.onNodeRemoved.bind(this));


	this.init();
}

//globals
SceneTree.DEFAULT_BACKGROUND_COLOR = new Float32Array([0,0,0,1]);
SceneTree.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

//LS.extendClass(ComponentContainer, SceneTree); //container methods

Object.defineProperty( SceneTree.prototype, "root", {
	enumerable: true,
	get: function() {
		return this._root;
	},
	set: function(v) {
		throw("Root node cannot be replaced");
	}
});

//methods

/**
* This initializes the content of the scene.
* Call it to clear the scene content
*
* @method init
* @return {Boolean} Returns true on success
*/
SceneTree.prototype.init = function()
{
	this.id = "";
	//this.materials = {}; //shared materials cache: moved to LS.RM.resources
	this.local_repository = null;

	this._root.removeAllComponents();
	this._nodes = [ this._root ];
	this._nodes_by_id = {"root":this._root};
	this.rt_cameras = [];

	//this._components = []; //remove all components

	this._root.addComponent( new Camera() );
	this.current_camera = this._root.camera;

	this._root.addComponent( new Light({ position: vec3.fromValues(100,100,100), target: vec3.fromValues(0,0,0) }) );

	this.ambient_color = new Float32Array( SceneTree.DEFAULT_AMBIENT_COLOR );
	this.background_color = new Float32Array( SceneTree.DEFAULT_BACKGROUND_COLOR );
	this.textures = {};

	this._frame = 0;
	this._last_collect_frame = -1; //force collect
	this._time = 0;
	this._global_time = 0; //in seconds
	this._start_time = 0; //in seconds
	this._last_dt = 1/60; //in seconds
	this._must_redraw = true;

	if(this.selected_node) delete this.selected_node;

	this.extra = {};

	this._renderer = LS.Renderer;
}

/**
* Clears the scene using the init function
* and trigger a "clear" LEvent
*
* @method clear
*/
SceneTree.prototype.clear = function()
{
	//remove all nodes to ensure no lose callbacks are left
	while(this._root._children && this._root._children.length)
		this._root.removeChild(this._root._children[0]);

	//remove scene components
	this._root.processActionInComponents("onRemovedFromNode",this); //send to components
	this._root.processActionInComponents("onRemovedFromScene",this); //send to components

	this.init();
	LEvent.trigger(this,"clear");
	LEvent.trigger(this,"change");
}

/**
* Configure the Scene using an object (the object can be obtained from the function serialize)
* Inserts the nodes, configure them, and change the parameters
*
* @method configure
* @param {Object} scene_info the object containing all the info about the nodes and config of the scene
*/
SceneTree.prototype.configure = function(scene_info)
{
	this._root.removeAllComponents(); //remove light and camera

	//this._components = [];
	//this.camera = this.light = null; //legacy

	if(scene_info.object_type != "SceneTree")
		trace("Warning: object set to scene doesnt look like a propper one.");

	if(scene_info.local_repository)
		this.local_repository = scene_info.local_repository;
	//parse basics
	if(scene_info.background_color)
		this.background_color.set(scene_info.background_color);
	if(scene_info.ambient_color)
		this.ambient_color.set(scene_info.ambient_color);

	if(scene_info.textures)
		this.textures = scene_info.textures;

	//extra info that the user wanted to save (comments, etc)
	if(scene_info.extra)
		this.extra = scene_info.extra;

	if(scene_info.root)
		this.root.configure( scene_info.root );

	//legacy
	if(scene_info.nodes)
		this.root.configure( { children: scene_info.nodes } );

	//parse materials
	/*
	if(scene_info.materials)
		for(var i in scene_info.materials)
			this.materials[ i ] = new Material( scene_info.materials[i] );
	*/

	//legacy
	if(scene_info.components)
		this._root.configureComponents(scene_info);

	// LEGACY...
	if(scene_info.camera)
	{
		if(this._root.camera)
			this._root.camera.configure( scene_info.camera );
		else
			this._root.addComponent( new Camera( scene_info.camera ) );
	}

	if(scene_info.light)
	{
		if(this._root.light)
			this._root.light.configure( scene_info.light );
		else
			this._root.addComponent( new Light(scene_info.light) );
	}
	else if(scene_info.hasOwnProperty("light")) //light is null
	{
		//skip default light
		if(this._root.light)
		{
			this._root.removeComponent( this._root.light );
			this._root.light = null;
		}
	}

	//if(scene_info.animations)
	//	this._root.animations = scene_info.animations;

	LEvent.trigger(this,"configure",scene_info);
	LEvent.trigger(this,"change");
}

/**
* Creates and object containing all the info about the scene and nodes.
* The oposite of configure.
* It calls the serialize method in every node
*
* @method serialize
* @return {Object} return a JS Object with all the scene info
*/

SceneTree.prototype.serialize = function()
{
	var o = {};

	o.object_type = getObjectClassName(this);

	//legacy
	o.local_repository = this.local_repository;

	//this is ugly but scenes can have also some rendering properties
	o.ambient_color = toArray( this.ambient_color );
	o.background_color = toArray( this.background_color ); //to non-typed
	o.textures = cloneObject(this.textures);

	//o.nodes = [];
	o.extra = this.extra || {};

	//add nodes
	o.root = this.root.serialize();

	//add shared materials
	/*
	if(this.materials)
	{
		o.materials = {};
		for(var i in this.materials)
			o.materials[ i ] = this.materials[i].serialize();
	}
	*/

	//serialize scene components
	//this.serializeComponents(o);

	LEvent.trigger(this,"serializing",o);

	return o;
}

/**
* loads a Scene from an Ajax call and pass it to the configure method.
*
* @method loadScene
* @param {String} url where the JSON object containing the scene is stored
* @param {Function}[on_complete=null] the callback to call when the loading is complete
* @param {Function}[on_error=null] the callback to call if there is a  loading error
*/

SceneTree.prototype.loadScene = function(url, on_complete, on_error)
{
	if(!url) return;
	var that = this;
	var nocache = ResourcesManager.getNoCache(true);
	if(nocache)
		url += (url.indexOf("?") == -1 ? "?" : "&") + nocache;


	LS.request({
		url: url,
		dataType: 'json',
		success: inner_success,
		error: inner_error
	});

	function inner_success(response)
	{
		that.init();
		that.configure(response);
		that.loadResources(inner_all_loaded);
	}

	function inner_all_loaded()
	{
		if(on_complete)
			on_complete();
	}

	function inner_error(err)
	{
		trace("Error loading scene: " + url + " -> " + err);
		if(on_error)
			on_error(url);
	}
}

SceneTree.prototype.appendScene = function(scene)
{
	//clone: because addNode removes it from scene.nodes array
	var nodes = scene.root.childNodes;

	/*
	//bring materials
	for(var i in scene.materials)
		this.materials[i] = scene.materials[i];
	*/
	
	//add every node one by one
	for(var i in nodes)
	{
		var node = nodes[i];
		var new_node = new LS.SceneNode( node.id );
		this.root.addChild( new_node );
		new_node.configure( node.constructor == LS.SceneNode ? node.serialize() : node  );
	}
}

SceneTree.prototype.getCamera = function()
{
	return this._root.camera;
}

SceneTree.prototype.getLight = function()
{
	return this._root.light;
}

/*
SceneTree.prototype.removeNode = function(node)
{
	if(!node._in_tree || node._in_tree != this)
		return;
	node.parentNode.removeChild(node);
}
*/

SceneTree.prototype.onNodeAdded = function(e,node)
{
	//remove from old scene
	if(node._in_tree && node._in_tree != this)
		throw("Cannot add a node from other scene, clone it");

	//generate unique id
	if(node.id && node.id != -1)
	{
		if(this._nodes_by_id[node.id] != null)
			node.id = node.id + "_" + (Math.random() * 1000).toFixed(0);
		this._nodes_by_id[node.id] = node;
	}

	//store
	this._nodes.push(node);

	//LEvent.trigger(node,"onAddedToScene", this);
	node.processActionInComponents("onAddedToScene",this); //send to components
	LEvent.trigger(this,"nodeAdded", node);
	LEvent.trigger(this,"change");
}

SceneTree.prototype.onNodeRemoved = function(e,node)
{
	var pos = this._nodes.indexOf(node);
	if(pos == -1) return;

	this._nodes.splice(pos,1);
	if(node.id)
		delete this._nodes_by_id[ node.id ];

	node.processActionInComponents("onRemovedFromNode",this); //send to components
	node.processActionInComponents("onRemovedFromScene",this); //send to components

	LEvent.trigger(this,"nodeRemoved", node);
	LEvent.trigger(this,"change");
	return true;
}


SceneTree.prototype.getNodes = function()
{
	return this._nodes;
}

/*
SceneTree.prototype.getNodes = function()
{
	var r = [];
	getnodes(this.root, r);

	function getnodes(node, result)
	{
		for(var i in node._children)
		{
			var n = node._children[i];
			result.push(n);
			if(n._children && n._children.length)
				getnodes(n,result);
		}
	}

	return r;
}
*/

/**
* retrieves a Node
*
* @method getNode
* @param {String} id node id
* @return {Object} the node or null if it didnt find it
*/

SceneTree.prototype.getNode = function(id)
{
	return this._nodes_by_id[id];
}

//for those who are more traditional
SceneTree.prototype.getElementById = SceneTree.prototype.getNode;


SceneTree.prototype.filterNodes = function( filter )
{
	var r = [];
	for(var i in this._nodes)
		if( filter(this._nodes[i]) )
			r.push(this._nodes[i]);
	return r;
}



/**
* retrieves a Node
*
* @method getNodeByUid
* @param {number} uid number
* @return {Object} the node or null if it didnt find it
*/

/*
SceneTree.prototype.getNodeByUid = function(uid)
{
	for(var i in this.nodes)
		if(this.nodes[i]._uid == uid)
			return this.nodes[i];
	return null;
}
*/

/**
* retrieves a Node by its index
*
* @method getNodeByIndex
* @param {Number} node index
* @return {Object} returns the node at the 'index' position in the nodes array
*/
/*
SceneTree.prototype.getNodeByIndex = function(index)
{
	return this.nodes[index];
}
*/

/**
* retrieves a Node index
*
* @method getNodeIndex
* @param {Node} node
* @return {Number} returns the node index in the nodes array
*/
/*
SceneTree.prototype.getNodeIndex = function(node)
{
	return this.nodes.indexOf(node);
}
*/

/**
* retrieves a Node
*
* @method getNodesByClass
* @param {String} className class name
* @return {Object} returns all the nodes that match this class name
*/

/*
SceneTree.prototype.getNodesByClass = function(classname)
{
	var r = [];
	for (var i in this.nodes)
		if(this.nodes[i].className && this.nodes[i].className.split(" ").indexOf(classname) != -1)
			r.push(this.nodes[i]);
	return r;
}
*/


/**
* loads all the resources of all the nodes in this scene
* it sends a signal to every node to get all the resources info
* and load them in bulk using the ResourceManager
*
* @method loadResources
*/

SceneTree.prototype.loadResources = function(on_complete)
{
	var res = {};

	//scene resources
	for(var i in this.textures)
		if(this.textures[i])
			res[ this.textures[i] ] = Texture;

	if(this.light) this.light.getResources(res);

	//resources from nodes
	for(var i in this._nodes)
		this._nodes[i].getResources(res);

	//used for scenes with special repository folders
	var options = {};
	if(this.local_repository)
		options.local_repository = this.local_repository;

	//count resources
	var num_resources = 0;
	for(var i in res)
		++num_resources;

	//load them
	if(num_resources == 0)
	{
		if(on_complete)
			on_complete();
		return;
	}

	LEvent.bind( LS.ResourcesManager, "end_loading_resources", on_loaded );
	LS.ResourcesManager.loadResources(res);

	function on_loaded()
	{
		LEvent.unbind( LS.ResourcesManager, "end_loading_resources", on_loaded );
		if(on_complete)
			on_complete();
	}
}

/**
* start the scene (triggers and start event)
*
* @method start
* @param {Number} dt delta time
*/
SceneTree.prototype.start = function()
{
	if(this._state == "running") return;

	this._state = "running";
	this._start_time = getTime() * 0.001;
	LEvent.trigger(this,"start",this);
	this.triggerInNodes("start");
}

/**
* stop the scene (triggers and start event)
*
* @method stop
* @param {Number} dt delta time
*/
SceneTree.prototype.stop = function()
{
	if(this._state == "stopped") return;

	this._state = "stopped";
	LEvent.trigger(this,"stop",this);
	this.triggerInNodes("stop");
}


/**
* renders the scene using the assigned renderer
*
* @method render
*/
SceneTree.prototype.render = function(camera, options)
{
	this._renderer.render(this, camera, options);
}

SceneTree.prototype.collectData = function()
{
	//var nodes = scene.nodes;
	var nodes = this.getNodes();
	var instances = [];
	var lights = [];
	var cameras = [];
	var colliders = [];

	//collect render instances, lights and cameras
	for(var i in nodes)
	{
		var node = nodes[i];

		if(node.flags.visible == false) //skip invisibles
			continue;

		//trigger event
		LEvent.trigger(node, "computeVisibility"); //, {camera: camera} options: options }

		//compute global matrix
		if(node.transform)
			node.transform.updateGlobalMatrix();

		//special node deformers (done here because they are shared for every node)
			//this should be moved to Renderer but not a clean way to do it
			var node_macros = {};
			LEvent.trigger(node, "computingShaderMacros", node_macros );

			var node_uniforms = {};
			LEvent.trigger(node, "computingShaderUniforms", node_uniforms );

		//store info
		node._macros = node_macros;
		node._uniforms = node_uniforms;
		node._instances = [];

		//get render instances: remember, triggers only support one parameter
		LEvent.trigger(node,"collectRenderInstances", node._instances );
		LEvent.trigger(node,"collectPhysicInstances", colliders );
		LEvent.trigger(node,"collectLights", lights );
		LEvent.trigger(node,"collectCameras", cameras );

		instances = instances.concat( node._instances );
	}

	//for each render instance collected
	for(var j in instances)
	{
		var instance = instances[j];
		instance.computeNormalMatrix();
		//compute the axis aligned bounding box
		if(!(instance.flags & RI_IGNORE_FRUSTUM))
			instance.updateAABB();
	}

	//for each physics instance collected
	for(var j in colliders)
	{
		var collider = colliders[j];
		collider.updateAABB();
	}

	this._instances = instances;
	this._lights = lights;
	this._cameras = cameras;
	this._colliders = colliders;

	//remember when was last time I collected to avoid repeating it
	this._last_collect_frame = this._frame;
}


SceneTree.prototype.update = function(dt)
{
	LEvent.trigger(this,"beforeUpdate", this);

	this._global_time = getTime() * 0.001;
	this._time = this._global_time - this._start_time;
	this._last_dt = dt;

	LEvent.trigger(this,"update", dt);
	this.triggerInNodes("update",dt, true);

	LEvent.trigger(this,"afterUpdate", this);
}

/**
* triggers an event to all nodes in the scene
*
* @method triggerInNodes
* @param {String} event_type event type name
* @param {Object} data data to send associated to the event
*/

SceneTree.prototype.triggerInNodes = function(event_type, data)
{
	LEvent.triggerArray( this._nodes, event_type, data);
}


SceneTree.prototype.generateUniqueNodeName = function(prefix)
{
	prefix = prefix || "node";
	var i = 1;

	var pos = prefix.lastIndexOf("_");
	if(pos)
	{
		var n = prefix.substr(pos+1);
		if( parseInt(n) )
		{
			i = parseInt(n);
			prefix = prefix.substr(0,pos);
		}
	}

	var node_name = prefix + "_" + i;
	while( this.getNode(node_name) != null )
		node_name = prefix + "_" + (i++);
	return node_name;
}


SceneTree.prototype.refresh = function()
{
	this._must_redraw = true;
}

SceneTree.prototype.getTime = function()
{
	return this._time;
}

//****************************************************************************

/**
* The SceneNode class represents and object in the scene
* Is the base class for all objects in the scene as meshes, lights, cameras, and so
*
* @class SceneNode
* @param{String} id the id (otherwise a random one is computed)
* @constructor
*/

function SceneNode(id)
{
	//Generic
	this.id = id || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
	this._uid = LS.generateUId();

	//this.className = "";
	//this.mesh = "";

	//flags
	this.flags = {
		visible: true,
		selectable: true,
		two_sided: false,
		flip_normals: false,
		//seen_by_camera: true,
		//seen_by_reflections: true,
		cast_shadows: true,
		receive_shadows: true,
		ignore_lights: false, //not_affected_by_lights
		alpha_test: false,
		alpha_shadows: false,
		depth_test: true,
		depth_write: true
	};

	//Basic components
	this._components = []; //used for logic actions
	this.addComponent( new Transform() );

	//material
	//this.material = new Material();
	this.extra = {}; //for extra info
}

//get methods from other classes
LS.extendClass(ComponentContainer, SceneNode); //container methods
LS.extendClass(CompositePattern, SceneNode); //container methods

/**
* changes the node id (its better to do not change the id, it can lead to unexpected results)
* remember that two nodes can't have the same id
* @method setId
* @param {String} new_id the new id
* @return {Object} returns true if the name changed
*/

SceneNode.prototype.setId = function(new_id)
{
	if(this.id == new_id) return true; //no changes

	var scene = this._in_tree;
	if(!scene)
	{
		this.id = new_id;
		return;
	}

	if( scene.getNode(new_id) != null)
	{
		console.error("ID already in use");
		return false;
	}

	if(this.id)
		delete scene._nodes_by_id[this.id];

	this.id = new_id;
	if(this.id)
		scene._nodes_by_id[ this.id ] = this;

	LEvent.trigger(this,"idChanged", new_id);
	LEvent.trigger(Scene,"nodeIdChanged", this);
	return true;
}

SceneNode.prototype.getResources = function(res, include_children)
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );

	//res in material
	if(this.material)
	{
		if(typeof(this.material) == "string")
		{
			if(this.material[0] != ":") //not a local material, then its a reference
			{
				res[this.material] = LS.Material;
			}
		}
		else //get the material to get the resources
		{
			var mat = this.getMaterial();
			if(mat)
				mat.getResources( res );
		}
	}

	//prefab
	if(this.prefab)
		res[this.prefab] = LS.Prefab;

	//propagate
	if(include_children)
		for(var i in this._children)
			this._children[i].getResources(res, true);

	return res;
}

SceneNode.prototype.getTransform = function() {
	return this.transform;
}

//Mesh component
SceneNode.prototype.getMesh = function() {
	var mesh = this.mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

//Light component
SceneNode.prototype.getLight = function() {
	return this.light;
}

//Camera component
SceneNode.prototype.getCamera = function() {
	return this.camera;
}

SceneNode.prototype.getLODMesh = function() {
	var mesh = this.lod_mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.lod_mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

SceneNode.prototype.setMesh = function(mesh_name, submesh_id)
{
	if(this.meshrenderer)
	{
		if(typeof(mesh_name) == "string")
			this.meshrenderer.configure({ mesh: mesh_name, submesh_id: submesh_id });
		else
			this.meshrenderer.mesh = mesh_name;
	}
	else
		this.addComponent(new MeshRenderer({ mesh: mesh_name, submesh_id: submesh_id }));
}

SceneNode.prototype.loadAndSetMesh = function(mesh_filename, options)
{
	options = options || {};

	if(ResourcesManager.meshes[mesh_filename] || !mesh_filename )
	{
		this.setMesh( mesh_filename );
		if(options.on_complete) options.on_complete( ResourcesManager.meshes[mesh_filename] ,this);
		return;
	}

	var that = this;
	var loaded = ResourcesManager.loadMesh(mesh_filename, options, function(mesh){
		that.setMesh(mesh.filename);
		that.loading -= 1;
		if(that.loading == 0)
		{
			LEvent.trigger(that,"resource_loaded",that);
			delete that.loading;
		}
		if(options.on_complete) options.on_complete(mesh,that);
	});

	if(!loaded)
	{
		if(!this.loading)
		{
			this.loading = 1;

			LEvent.trigger(this,"resource_loading");
		}
		else
			this.loading += 1;
	}
}

SceneNode.prototype.getMaterial = function()
{
	if (!this.material) return null;
	if(this.material.constructor === String)
		return this._in_tree ? LS.ResourcesManager.materials[ this.material ] : null;
	return this.material;
}


SceneNode.prototype.setPrefab = function(prefab_name)
{
	this._prefab_name = prefab_name;
	var prefab = LS.ResourcesManager.resources[prefab_name];
	if(!prefab)
		return;


}


/**
* remember clones this node and returns the new copy (you need to add it to the scene to see it)
* @method clone
* @return {Object} returns a cloned version of this node
*/

SceneNode.prototype.clone = function()
{
	var scene = this._in_tree;

	var new_name = scene ? scene.generateUniqueNodeName( this.id ) : this.id ;
	var newnode = new SceneNode( new_name );
	var info = this.serialize();
	info.id = null;
	newnode.configure( info );

	/*
	//clone children (none of them is added to the SceneTree)
	for(var i in this._children)
	{
		var new_child_name = scene ? scene.generateUniqueNodeName( this._children[i].id ) : this._children[i].id;
		var childnode = new SceneNode( new_child_name );
		var info = this._children[i].serialize();
		info.id = null;
		childnode.configure( info );
		newnode.addChild(childnode);
	}
	*/

	return newnode;
}

/**
* Configure this node from an object containing the info
* @method configure
* @param {Object} info the object with all the info (comes from the serialize method)
*/
SceneNode.prototype.configure = function(info)
{
	if (info.id) this.setId(info.id);
	if (info.className)	this.className = info.className;

	//useful parsing
	if(info.mesh)
	{
		var mesh = info.mesh;
		if(typeof(mesh) == "string")
			mesh = ResourcesManager.meshes[mesh];

		if(mesh)
		{
			if(mesh.bones)
				this.addComponent( new SkinnedMeshRenderer({ mesh: info.mesh, submesh_id: info.submesh_id }) );
			else
				this.addComponent( new MeshRenderer({ mesh: info.mesh, submesh_id: info.submesh_id, morph_targets: info.morph_targets }) );
		}
	}

	//first the no components
	if(info.material)
	{
		var mat_class = info.material.material_class;
		if(!mat_class) 
			mat_class = "Material";
		this.material = typeof(info.material) == "string" ? info.material : new LS.MaterialClasses[mat_class](info.material);
	}

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	//DEPRECATED: hardcoded components
	if(info.transform) this.transform.configure( info.transform ); //all nodes have a transform
	if(info.light) this.addComponent( new Light(info.light) );
	if(info.camera)	this.addComponent( new Camera(info.camera) );

	//DEPRECATED: model in matrix format
	if(info.model) this.transform.fromMatrix( info.model ); 

	if(info.prefab) this.prefab = info.prefab;

	//add animation
	if(info.animations)
	{
		this.animations = info.animations;
		this.addComponent( new PlayAnimation({animation:this.animations}) );
	}

	//extra user info
	if(info.extra)
		this.extra = info.extra;

	if(info.comments)
		this.comments = info.comments;

	//restore components
	if(info.components)
		this.configureComponents(info);

	this.configureChildren(info);

	//ierarchy: this goes last because it needs to read transform
	/*
	if(info.parent_id) //name of the parent
	{
		if(this._in_tree)
		{
			var parent = this._in_tree.getNode( info.parent_id );
			if(parent) 
				parent.addChild( this );
		}
		else
			this.parent = info.parent_id;
	}
	*/

	LEvent.trigger(this,"configure",info);
}

/**
* Serializes this node by creating an object with all the info
* it contains info about the components too
* @method serialize
* @return {Object} returns the object with the info
*/
SceneNode.prototype.serialize = function()
{
	var o = {};

	if(this.id) o.id = this.id;
	if(this.className) o.className = this.className;

	//modules
	if(this.mesh && typeof(this.mesh) == "string") o.mesh = this.mesh; //do not save procedural meshes
	if(this.submesh_id != null) o.submesh_id = this.submesh_id;
	if(this.material) o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();
	if(this.prefab) o.prefab = this.prefab;

	if(this.flags) o.flags = cloneObject(this.flags);

	//extra user info
	if(this.extra) o.extra = this.extra;
	if(this.comments) o.comments = this.comments;

	if(this._children)
		o.children = this.serializeChildren();

	//save children ierarchy
	//if(this.parentNode)
	//	o.parent_id = this.parentNode.id;
	/*
	if(this._children && this._children.length)
	{
		o.children = [];
		for(var i in this._children)
			o.children.push( this._children[i].id );
	}
	*/

	//save components
	this.serializeComponents(o);

	//extra serializing info
	LEvent.trigger(this,"serialize",o);

	return o;
}

SceneNode.prototype._onChildAdded = function(node, recompute_transform)
{
	if(recompute_transform && this.transform)
	{
		var M = node.transform.getGlobalMatrix(); //get son transform
		var M_parent = this.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		node.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}
	//link transform
	if(this.transform)
		node.transform._parent = this.transform;
}

SceneNode.prototype._onChangeParent = function(future_parent, recompute_transform)
{
	if(recompute_transform && future_parent.transform)
	{
		var M = this.transform.getGlobalMatrix(); //get son transform
		var M_parent = future_parent.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		this.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}
	//link transform
	if(future_parent.transform)
		this.transform._parent = future_parent.transform;
}

SceneNode.prototype._onChildRemoved = function(node, recompute_transform)
{
	if(this.transform)
	{
		//unlink transform
		if(recompute_transform)
		{
			var m = node.transform.getGlobalMatrix();
			node.transform._parent = null;
			node.transform.fromMatrix(m);
		}
		else
			node.transform._parent = null;
	}
}

//***************************************************************************

//create one default scene

LS.SceneTree = SceneTree;
LS.SceneNode = SceneNode;
var Scene = new SceneTree();

LS.newMeshNode = function(id,mesh_name)
{
	var node = new SceneNode(id);
	node.addComponent( new MeshRenderer() );
	node.setMesh(mesh_name);
	return node;
}

LS.newLightNode = function(id)
{
	var node = new SceneNode(id);
	node.addComponent( new Light() );
	return node;
}

LS.newCameraNode = function(id)
{
	var node = new SceneNode(id);
	node.addComponent( new Camera() );
	return node;
}

//*******************************/

