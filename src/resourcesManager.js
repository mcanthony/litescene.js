/**
* Static class that contains all the resources loaded, parsed and ready to use.
* It also contains the parsers and methods in charge of processing them
*
* @class ResourcesManager
* @constructor
*/

// **** RESOURCES MANANGER *********************************************
// Resources should follow the text structure:
// + id: number, if stored in remote server
// + resource_type: string ("Mesh","Texture",...) or if omitted the classname will be used
// + filename: string (this string will be used to get the filetype)
// + fullpath: the full path to reach the file on the server (folder + filename)
// + preview: img url
// + toBinary: generates a binary version to store on the server
// + serialize: generates an stringifible object to store on the server

// + _original_data: ArrayBuffer with the bytes form the original file
// + _original_file: File with the original file where this res came from

var ResourcesManager = {

	path: "", //url to retrieve resources relative to the index.html
	proxy: "", //url to retrieve resources outside of this host
	ignore_cache: false, //change to true to ignore server cache
	free_data: false, //free all data once it has been uploaded to the VRAM
	keep_files: false, //keep the original files inside the resource (used mostly in the editor)

	//some containers
	resources: {}, //filename associated to a resource (texture,meshes,audio,script...)
	meshes: {}, //loadead meshes
	textures: {}, //loadead textures
	materials: {}, //shared materials

	resources_not_found: {}, //resources that will be skipped because they werent found
	resources_being_loaded: {}, //resources waiting to be loaded
	resources_being_processed: {}, //used to avoid loading stuff that is being processes
	num_resources_being_loaded: 0,
	MAX_TEXTURE_SIZE: 4096,

	formats: {"js":"text", "json":"json", "xml":"xml"},
	formats_resource: {},	//tells which resource expect from this file format
	resource_pre_callbacks: {}, //used to extract resource info from a file ->  "obj":callback
	resource_post_callbacks: {}, //used to post process a resource type -> "Mesh":callback
	resource_once_callbacks: {}, //callback called once

	virtual_file_systems: {}, //protocols associated to urls  "VFS":"../"

	/**
	* Returns a string to append to any url that should use the browser cache (when updating server info)
	*
	* @method getNoCache
	* @param {Boolean} force force to return a nocache string ignoring the default configuration
	* @return {String} a string to attach to a url so the file wont be cached
	*/

	getNoCache: function(force) { return (!this.ignore_cache && !force) ? "" : "nocache=" + getTime() + Math.floor(Math.random() * 1000); },

	/**
	* Resets all the resources cached, so it frees the memory
	*
	* @method reset
	*/
	reset: function()
	{
		this.resources = {};
		this.meshes = {};
		this.textures = {};
	},

	registerFileFormat: function(extension, data_type)
	{
		this.formats[extension.toLowerCase()] = data_type;
	},	

	registerResourcePreProcessor: function(fileformats, callback, data_type, resource_type)
	{
		var ext = fileformats.split(",");
		for(var i in ext)
		{
			var extension = ext[i].toLowerCase();
			this.resource_pre_callbacks[ extension ] = callback;
			if(data_type)
				this.formats[ extension ] = data_type;
			if(resource_type)
				this.formats_resource[ extension ] = resource_type;
		}
	},

	registerResourcePostProcessor: function(resource_type, callback)
	{
		this.resource_post_callbacks[ resource_type ] = callback;
	},

	/**
	* Returns the filename extension from an url
	*
	* @method getExtension
	* @param {String} url
	* @return {String} filename extension
	*/

	getExtension: function(url)
	{
		var question = url.indexOf("?");
		if(question != -1)
			url = url.substr(0,question);

		var point = url.lastIndexOf(".");
		if(point == -1) return "";
		return url.substr(point+1).toLowerCase();
	},

	/**
	* Returns the filename from a full path
	*
	* @method getFilename
	* @param {String} fullpath
	* @return {String} filename extension
	*/
	getFilename: function( fullpath )
	{
		var pos = fullpath.lastIndexOf("/");
		//if(pos == -1) return fullpath;
		var question = fullpath.lastIndexOf("?");
		question = (question == -1 ? fullpath.length : (question - 1) ) - pos;
		return fullpath.substr(pos+1,question);
	},	

	/**
	* Returns the folder from a fullpath
	*
	* @method getFolder
	* @param {String} fullpath
	* @return {String} folder name
	*/
	getFolder: function(fullpath)
	{
		var pos = fullpath.lastIndexOf("/");
		return fullpath.substr(0,pos);
	},	

	/**
	* Returns the filename without the extension
	*
	* @method getBasename
	* @param {String} fullpath
	* @return {String} filename extension
	*/
	getBasename: function(fullpath)
	{
		var name = this.getFilename(fullpath);
		var pos = name.indexOf(".");
		if(pos == -1) return name;
		return name.substr(0,pos);
	},

	/**
	* Cleans resource name (removing double slashes)
	*
	* @method cleanFullpath
	* @param {String} fullpath
	* @return {String} fullpath cleaned
	*/
	cleanFullpath: function(fullpath)
	{
		//clean up the filename (to avoid problems with //)
		if(fullpath.indexOf("://") == -1)
			return fullpath.split("/").filter(function(v){ return !!v; }).join("/");
		return fullpath;
	},

	/**
	* Loads all the resources in the Object (it uses an object to store not only the filename but also the type)
	*
	* @method loadResources
	* @param {Object} resources contains all the resources, associated with its type
	* @param {Object}[options={}] options to apply to the loaded resources
	*/
	loadResources: function(res, options )
	{
		for(var i in res)
		{
			if( typeof(i) != "string" || i[0] == ":" )
				continue;
			this.load(i, options );
		}
	},	

	/**
	* Set the base path where all the resources will be fetched (unless they have absolute URL)
	* By default it will use the website home address
	*
	* @method setPath
	* @param {String} url
	*/
	setPath: function( url )
	{
		this.path = url;
	},

	/**
	* Set a proxy url where all non-local resources will be requested, allows to fetch assets to other servers.
	* request will be in this form: proxy_url + "/" + url_with_protocol: ->   http://myproxy.com/google.com/images/...
	*
	* @method setProxy
	* @param {String} proxy_url
	*/
	setProxy: function( proxy_url )
	{
		if( proxy_url.indexOf("@") != -1 )
			this.proxy = "http://" + proxy_url.replace("@", window.location.host );
		else
			this.proxy = proxy_url;
	},

	/**
	* transform a url to a full url taking into account proxy, virtual file systems and local_repository
	*
	* @method getFullURL
	* @param {String} url
	* @param {Object} options
	* @return {String} full url
	*/
	getFullURL: function( url, options )
	{
		var pos = url.indexOf("://");
		var protocol = "";
		if(pos != -1)
			protocol = url.substr(0,pos);

		var resources_path = this.path;
		if(options && options.force_local_url)
			resources_path = ".";

		//used special repository
		if(options && options.local_repository)
			resources_path = options.local_repository;

		if(protocol)
		{
			switch(protocol)
			{
				case 'http':
				case 'https':
					full_url = url;
					if(this.proxy) //proxy external files
						return this.proxy + url.substr(pos+3); //"://"
					return full_url;
					break;
				case 'blob':
					return url; //special case for local urls like URL.createObjectURL
				case '': //strange case
					return url;
					break;
				default:
					if(url[0] == ":") //local resource
						return url;
					//test for virtual file system address
					var root_path = this.virtual_file_systems[ protocol ] || resources_path;
					return root_path + "/" + url.substr(pos+1);
			}
		}
		else
			return resources_path + "/" + url;
	},

	/**
	* Allows to associate a resource path like "vfs:myfile.png" to an url according to the value before the ":".
	* This way we can have alias for different folders where the assets are stored.
	* P.e:   "e","http://domain.com"  -> will transform "e:myfile.png" in "http://domain.com/myfile.png"
	*
	* @method registerFileSystem
	* @param {String} name the filesystem name (the string before the colons in the path)
	* @param {String} url the url to attach before 
	*/
	registerFileSystem: function(name, url)
	{
		this.virtual_file_systems[name] = url;
	},

	/**
	* Returns the resource if it has been loaded, if you want to force to load it, use load
	*
	* @method getResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	*/
	getResource: function( url )
	{
		if(!url)
			return null;
		url = url.split("/").filter(function(v){ return !!v; }).join("/");
		return this.resources[ url ];
	},

	/**
	* Marks the resource as modified, used in editor to know when a resource data should be updated
	*
	* @method resourceModified
	* @param {Object} resource
	*/
	resourceModified: function(resource)
	{
		if(!resource)
			return;
		delete resource._original_data;
		delete resource._original_file;
		resource._modified = true;
		LEvent.trigger(this, "resource_modified", resource );
	},

	/**
	* Unmarks the resource as modified
	*
	* @method resourceSaved
	* @param {Object} resource
	*/
	resourceSaved: function(resource)
	{
		if(!resource)
			return;
		delete resource._modified;
		LEvent.trigger(this, "resource_saved", resource );
	},

	/**
	* Loads a generic resource, the type will be infered from the extension, if it is json or wbin it will be processed
	* Do not use to load regular files (txts, csv, etc), instead use the LS.Network methods
	*
	* @method load
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {Object}[options={}] options to apply to the loaded resource when processing it
	* @param {Function} [on_complete=null] callback when the resource is loaded and cached, params: callback( url, resource, options )
	*/
	load: function(url, options, on_complete)
	{
		//if we already have it, then nothing to do
		if(this.resources[url] != null)
		{
			if(on_complete)
				on_complete(this.resources[url]);
			return true;
		}

		options = options || {};

		//extract the filename extension
		var extension = this.getExtension(url);
		if(!extension) //unknown file type
			return false;

		if(this.resources_not_found[url])
			return;

		//if it is already being loaded, then add the callback and wait
		if(this.resources_being_loaded[url])
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		if(this.resources_being_processed[url])
			return; //nothing to load, just waiting for the callback to process it

		//otherwise we have to load it
		//set the callback
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];

		LEvent.trigger( LS.ResourcesManager, "resource_loading", url );
		//send an event if we are starting to load (used for loading icons)
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger( LS.ResourcesManager,"start_loading_resources", url );
		this.num_resources_being_loaded++;

		var full_url = this.getFullURL(url);

		//avoid the cache (if you want)
		var nocache = this.getNoCache();
		if(nocache)
			full_url += (full_url.indexOf("?") == -1 ? "?" : "&") + nocache;

		//create the ajax request
		var settings = {
			url: full_url,
			success: function(response){
				LS.ResourcesManager.processResource( url, response, options, ResourcesManager._resourceLoadedSuccess );
			},
			error: function(err) { 	LS.ResourcesManager._resourceLoadedError(url,err); },
			progress: function(e) { LEvent.trigger( LS.ResourcesManager, "resource_loading_progress", { url: url, event: e } ); }
		};

		//in case we need to force a response format 
		var file_format = this.formats[ extension ];
		if(file_format) //if not it will be set by http server
			settings.dataType = file_format;

		//send the REQUEST
		LS.Network.request(settings); //ajax call
		return false;
	},

	/**
	* Process resource get some form of data and transforms it to a resource (and Object ready to be used by the engine).
	* In most cases the process involves parsing and uploading to the GPU
	* It is called for every single resource that comes from an external source (URL) right after being loaded
	*
	* @method processResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} data the data of the resource (could be string, arraybuffer, image... )
	* @param {Object}[options={}] options to apply to the loaded resource
	*/

	processResource: function( url, data, options, on_complete )
	{
		options = options || {};
		if(!data) throw("No data found when processing resource: " + url);
		var resource = null;
		var extension = this.getExtension(url);

		//this.resources_being_loaded[url] = [];
		this.resources_being_processed[url] = true;

		//no extension, then or it is a JSON, or an object with object_type or a WBin
		if(!extension)
		{
			if(typeof(data) == "string")
				data = JSON.parse(data);

			if(data.constructor == ArrayBuffer)
			{
				resource = WBin.load(data);
				inner_onResource(url, resource);
				return;
			}
			else
			{
				var type = data.object_type;
				if(type && window[type])
				{
					var ctor = window[type];
					var resource = null;
					if(ctor.prototype.configure)
					{
						resource = new window[type]();
						resource.configure( data );
					}
					else
						resource = new window[type]( data );
					inner_onResource(url, resource);
					return;
				}
				else
					return false;
			}
		}

		var callback = this.resource_pre_callbacks[extension.toLowerCase()];
		if(!callback)
		{
			console.log("Resource format unknown: " + extension)
			return false;
		}

		//parse
		var resource = callback(url, data, options, inner_onResource);
		if(resource)
			inner_onResource(url, resource);

		//callback when the resource is ready
		function inner_onResource( fullpath, resource )
		{
			resource.remote = true;
			resource.filename = fullpath;
			if(options.filename) //used to overwrite
				resource.filename = options.filename;

			//if(!resource.fullpath) //why??
			resource.fullpath = fullpath;

			if( LS.ResourcesManager.resources_being_processed[ fullpath ] )
				delete LS.ResourcesManager.resources_being_processed[ fullpath ];

			//keep original file inside the resource
			if(LS.ResourcesManager.keep_files && (data.constructor == ArrayBuffer || data.constructor == String) )
				resource._original_data = data;

			//load associated resources
			if(resource.getResources)
				ResourcesManager.loadResources( resource.getResources({}) );

			//register in the containers
			LS.ResourcesManager.registerResource( fullpath, resource );

			//callback 
			if(on_complete)
				on_complete( fullpath, resource, options );
		}
	},

	/**
	* Stores the resource inside the manager containers. This way it will be retrieveble by anybody who needs it.
	*
	* @method registerResource
	* @param {String} filename fullpath 
	* @param {Object} resource 
	*/
	registerResource: function( filename, resource )
	{
		//clean up the filename (to avoid problems with //)
		filename = this.cleanFullpath( filename );

		if(this.resources[ filename ] == resource)
			return; //already registered

		resource.filename = filename; //filename is a given name
		//resource.fullpath = filename; //fullpath only if they are in the server

		//get which kind of resource
		if(!resource.object_type)
			resource.object_type = LS.getObjectClassName( resource );
		var type = resource.object_type;
		if(resource.constructor.resource_type)
			type = resource.constructor.resource_type;

		//some resources could be postprocessed after being loaded
		var post_callback = this.resource_post_callbacks[ type ];
		if(post_callback)
			post_callback( filename, resource );

		//global container
		this.resources[ filename ] = resource;

		//send message to inform new resource is available
		LEvent.trigger(this,"resource_registered", resource);
		LS.GlobalScene.refresh(); //render scene
	},	

	/**
	* removes the resources from all the containers
	*
	* @method unregisterResource
	* @param {String} filename 
	* @return {boolean} true is removed, false if not found
	*/
	unregisterResource: function(filename)
	{
		if(!this.resources[filename])
			return false; //not found

		delete this.resources[filename];

		//ugly: too hardcoded
		if( this.meshes[filename] )
			delete this.meshes[ filename ];
		if( this.textures[filename] )
			delete this.textures[ filename ];

		LEvent.trigger(this,"resource_unregistered", resource);
		LS.GlobalScene.refresh(); //render scene
		return true;
	},

	/**
	* Returns an object with a representation of the resource internal data
	* The order to obtain that object is:
	* 1. test for _original_file (File or Blob)
	* 2. test for _original_data (ArrayBuffer)
	* 3. toBinary() (ArrayBuffer)
	* 4. toBlob() (Blob)
	* 5. toBase64() (String)
	* 6. serialize() (Object in JSON format)
	* 7. data property 
	* 8. JSON.stringify(...)
	*
	* @method computeResourceInternalData
	* @param {Object} resource 
	* @return {Object} it has two fields: data and encoding
	*/
	computeResourceInternalData: function(resource)
	{
		if(!resource) throw("Resource is null");

		var data = null;
		var encoding = "text";
		var extension = "";

		//get the data
		if (resource._original_file) //file
		{
			data = resource._original_file;
			encoding = "file";
		}
		else if(resource._original_data) //file in ArrayBuffer format
			data = resource._original_data;
		else if(resource.toBinary) //a function to compute the ArrayBuffer format
		{
			data = resource.toBinary();
			encoding = "binary";
			extension = "wbin";
		}
		else if(resource.toBlob) //a blob (Canvas should have this)
		{
			data = resource.toBlob();
			encoding = "file";
		}
		else if(resource.toBase64) //a base64 string
		{
			data = resource.toBase64();
			encoding = "base64";
		}
		else if(resource.serialize) //a json object
			data = JSON.stringify( resource.serialize() );
		else if(resource.data) //regular string data
			data = resource.data;
		else
			data = JSON.stringify( resource );

		if(data.buffer && data.buffer.constructor == ArrayBuffer)
			data = data.buffer; //store the data in the arraybuffer

		return {data:data, encoding: encoding, extension: extension};
	},
		
	/**
	* Used to load files and get them as File (or Blob)
	* @method getURLasFile
	* @param {String} filename 
	* @return {File} the file
	*/
	getURLasFile: function( url, on_complete )
	{
		var oReq = new XMLHttpRequest();
		oReq.open("GET", this.getFullURL(url), true);
		oReq.responseType = "blob";
		oReq.onload = function(oEvent) {
		  var blob = oReq.response;
		  if(on_complete)
			  on_complete(blob, url);
		};
		oReq.send();
	},

	/**
	* Changes the name of a resource and sends an event to all components to change it accordingly
	* @method renameResource
	* @param {String} old 
	* @param {String} newname
	* @param {Boolean} [skip_event=false] ignore sending an event to all components to rename the resource
	* @return {boolean} if the file was found
	*/
	renameResource: function(old, newname, skip_event)	
	{
		var res = this.resources[ old ];
		if(!res)
			return false;

		res.filename = newname;
		if(res.fullpath)
			res.fullpath = newname;

		this.resources[newname] = res;
		delete this.resources[ old ];

		if(!skip_event)
			this.sendResourceRenamedEvent(old, newname, res);

		//ugly: too hardcoded
		if( this.meshes[old] ) {
			delete this.meshes[ old ];
			this.meshes[ newname ] = res;
		}
		if( this.textures[old] ) {
			delete this.textures[ old ];
			this.textures[ newname ] = res;
		}
		return true;
	},

	/**
	* Tells if it is loading resources
	*
	* @method isLoading
	* @return {Boolean}
	*/
	isLoading: function()
	{
		return this.num_resources_being_loaded > 0;
	},	

	/**
	* forces to try to reload again resources not found
	*
	* @method isLoading
	* @return {Boolean}
	*/
	clearNotFoundResources: function()
	{
		this.resources_not_found = {};
	},

	processScene: function(filename, data, options)
	{
		var scene_data = Parser.parse(filename, data, options);

		//register meshes
		if(scene_data.meshes)
		{
			for (var i in scene_data.meshes)
			{
				var mesh_data = scene_data.meshes[i];
				var mesh = GL.Mesh.load(mesh_data);
				/*
				var morphs = [];
				if(mesh.morph_targets)
					for(var j in mesh.morph_targets)
					{

					}
				*/

				LS.ResourcesManager.registerResource(i,mesh);
			}
		}

		//Build the scene tree
		var scene = new LS.SceneTree();
		scene.configure(scene_data);

		//load from the internet associated resources 
		scene.loadResources();

		return scene;
	},

	computeImageMetadata: function(texture)
	{
		var metadata = { width: texture.width, height: texture.height };
		return metadata;
	},


	/**
	* returns a mesh resource if it is loaded
	*
	* @method getMesh
	* @param {String} filename 
	* @return {Mesh}
	*/
	getMesh: function(name) {
		if(!name)
			return null;
		if(name.constructor === String)
			return this.meshes[name];
		if(name.constructor === GL.Mesh)
			return name;
		return null;
	},

	/**
	* returns a texture resource if it is loaded
	*
	* @method getTexture
	* @param {String} filename could be a texture itself in which case returns the same texture
	* @return {Texture} 
	*/
	getTexture: function(name) {
		if(!name)
			return null;
		if(name.constructor === String)
			return this.textures[name];
		if(name.constructor === GL.Texture)
			return name;
		return null;
	},

	//tells to all the components, nodes, materials, etc, that one resource has changed its name
	sendResourceRenamedEvent: function(old_name, new_name, resource)
	{
		var scene = LS.GlobalScene;
		for(var i = 0; i < scene._nodes.length; i++)
		{
			//nodes
			var node = scene._nodes[i];

			//components
			for(var j = 0; j < node._components.length; j++)
			{
				var component = node._components[j];
				if(component.onResourceRenamed)
					component.onResourceRenamed( old_name, new_name, resource )
			}
	
			//materials
			var material = node.getMaterial();
			if(material && material.onResourceRenamed)
				material.onResourceRenamed(old_name, new_name, resource)
		}
	},

	/**
	* Binds a callback for when a resource is loaded (in case you need to do something special)
	*
	* @method onceLoaded
	* @param {String} fullpath of the resource you want to get the notification once is loaded
	* @param {Function} callback the function to call, it will be called as callback( fullpath, resource )
	*/
	onceLoaded: function( fullpath, callback )
	{
		var array = this.resource_once_callbacks[ fullpath ];
		if(!array)
		{
			this.resource_once_callbacks[ fullpath ] = [ callback ];
			return;
		}

		//avoid repeating
		for(var i in array)
			if( array[i] == callback )
				return;
		array.push( callback );
	},

	//*************************************

	//Called after a resource has been loaded successfully and processed
	_resourceLoadedSuccess: function(url,res)
	{
		if( LS.ResourcesManager.debug )
			console.log("RES: " + url + " ---> " + LS.ResourcesManager.num_resources_being_loaded);

		for(var i in LS.ResourcesManager.resources_being_loaded[url])
		{
			if( LS.ResourcesManager.resources_being_loaded[url][i].callback != null )
				LS.ResourcesManager.resources_being_loaded[url][i].callback(res);
		}

		//triggers 'once' callbacks
		if(LS.ResourcesManager.resource_once_callbacks[ url ])
		{
			var v = LS.ResourcesManager.resource_once_callbacks[url];
			for(var i in v)
				v[i](url, res);
			delete LS.ResourcesManager.resource_once_callbacks[url];
		}

		//two pases, one for launching, one for removing
		if( LS.ResourcesManager.resources_being_loaded[url] )
		{
			delete LS.ResourcesManager.resources_being_loaded[url];
			LS.ResourcesManager.num_resources_being_loaded--;
			LEvent.trigger( LS.ResourcesManager, "resource_loaded", url );
			if( LS.ResourcesManager.num_resources_being_loaded == 0)
			{
				LEvent.trigger( LS.ResourcesManager, "end_loading_resources", true);
			}
		}
	},

	_resourceLoadedError: function(url, error)
	{
		console.log("Error loading " + url);
		delete LS.ResourcesManager.resources_being_loaded[url];
		delete LS.ResourcesManager.resource_once_callbacks[url];
		LS.ResourcesManager.resources_not_found[url] = true;
		LEvent.trigger( LS.ResourcesManager, "resource_not_found", url);
		LS.ResourcesManager.num_resources_being_loaded--;
		if( LS.ResourcesManager.num_resources_being_loaded == 0 )
			LEvent.trigger( LS.ResourcesManager, "end_loading_resources", false);
			//$(ResourcesManager).trigger("end_loading_resources");
	},

	//NOT TESTED: to load script asyncronously, not finished. similar to require.js
	require: function(files, on_complete)
	{
		if(typeof(files) == "string")
			files = [files];

		//store for the callback
		var last = files[ files.length - 1];
		if(on_complete)
		{
			if(!ResourcesManager._waiting_callbacks[ last ])
				ResourcesManager._waiting_callbacks[ last ] = [on_complete];
			else
				ResourcesManager._waiting_callbacks[ last ].push(on_complete);
		}
		require_file(files);

		function require_file(files)
		{
			//avoid require twice a file
			var url = files.shift(1); 
			while( ResourcesManager._required_files[url] && url )
				url = files.shift(1);

			ResourcesManager._required_files[url] = true;

			LS.Network.request({
				url: url,
				success: function(response)
				{
					eval(response);
					if( ResourcesManager._waiting_callbacks[ url ] )
						for(var i in ResourcesManager._waiting_callbacks[ url ])
							ResourcesManager._waiting_callbacks[ url ][i]();
					require_file(files);
				}
			});
		}
	},
	_required_files: {},
	_waiting_callbacks: {}
};

LS.ResourcesManager = ResourcesManager;
LS.RM = ResourcesManager;

LS.getTexture = function(name_or_texture) {
	return LS.ResourcesManager.getTexture(name_or_texture);
}	


//Post process resources *******************

LS.ResourcesManager.registerResourcePostProcessor("Mesh", function(filename, mesh ) {

	mesh.object_type = "Mesh"; //useful
	if(mesh.metadata)
	{
		mesh.metadata = {};
		mesh.generateMetadata(); //useful
	}
	if(!mesh.bounding || mesh.bounding.length != BBox.data_length)
	{
		mesh.bounding = null; //remove bad one (just in case)
		mesh.updateBounding();
	}
	if(!mesh.getBuffer("normals"))
		mesh.computeNormals();

	if(LS.ResourcesManager.free_data) //free buffers to reduce memory usage
		mesh.freeData();

	LS.ResourcesManager.meshes[filename] = mesh;
});

LS.ResourcesManager.registerResourcePostProcessor("Texture", function(filename, texture ) {
	//store
	LS.ResourcesManager.textures[filename] = texture;
});

LS.ResourcesManager.registerResourcePostProcessor("Material", function(filename, material ) {
	//store
	LS.ResourcesManager.materials[filename] = material;
});



//Resources readers *********
//global formats: take a file and extract info
LS.ResourcesManager.registerResourcePreProcessor("wbin", function(filename, data, options) {
	var data = new WBin.load(data);
	return data;
},"binary");

LS.ResourcesManager.registerResourcePreProcessor("json", function(filename, data, options) {
	var resource = data;
	if( data.constructor === String )
		data = JSON.parse(data);

	if( data.object_type && window[ data.object_type ] )
	{
		var ctor = window[ data.object_type ];
		if(ctor.prototype.configure)
		{
			resource = new ctor();
			resource.configure(data);
		}
		else
			resource = new ctor(data);
	}
	return resource;
});

//Textures ********
//Takes one image (or canvas) as input and creates a Texture
LS.ResourcesManager.processImage = function(filename, img, options)
{
	if(img.width == (img.height / 6) || filename.indexOf("CUBECROSS") != -1) //cubemap
	{
		var cubemap_options = { wrapS: gl.MIRROR, wrapT: gl.MIRROR, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR };
		if( filename.indexOf("CUBECROSSL") != -1 )
			cubemap_options.is_cross = 1;
		var texture = Texture.cubemapFromImage(img, cubemap_options);
		texture.img = img;
		console.log("Cubemap created");
	}
	else //regular texture
	{
		var default_mag_filter = gl.LINEAR;
		var default_wrap = gl.REPEAT;
		//var default_min_filter = img.width == img.height ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
		var default_min_filter = gl.LINEAR_MIPMAP_LINEAR;
		if( !isPowerOfTwo(img.width) || !isPowerOfTwo(img.height) )
		{
			default_min_filter = gl.LINEAR;
			default_wrap = gl.CLAMP_TO_EDGE; 
		}
		var texture = null;

		//from TGAs...
		if(img.pixels) //not a real image, just an object with width,height and a buffer with all the pixels
			texture = GL.Texture.fromMemory(img.width, img.height, img.pixels, { format: (img.bpp == 24 ? gl.RGB : gl.RGBA), wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter });
		else //default format is RGBA (because particles have alpha)
			texture = GL.Texture.fromImage(img, { format: gl.RGBA, wrapS: default_wrap, wrapT: default_wrap, magFilter: default_mag_filter, minFilter: default_min_filter });
		texture.img = img;
	}

	texture.filename = filename;
	texture.generateMetadata(); //useful
	return texture;
}

//basic formats
LS.ResourcesManager.registerResourcePreProcessor("jpg,jpeg,png,webp,gif", function(filename, data, options, callback) {

	var extension = LS.ResourcesManager.getExtension(filename);
	var mimetype = 'image/png';
	if(extension == "jpg" || extension == "jpeg")
		mimetype = "image/jpg";
	if(extension == "webp")
		mimetype = "image/webp";
	if(extension == "gif")
		mimetype = "image/gif";

	var blob = new Blob([data],{type: mimetype});
	var objectURL = URL.createObjectURL( blob );
	var image = new Image();
	image.src = objectURL;
	image.real_filename = filename; //hard to get the original name from the image
	image.onload = function()
	{
		var filename = this.real_filename;
		var texture = LS.ResourcesManager.processImage( filename, this, options );
		if(texture)
		{
			//LS.ResourcesManager.registerResource( filename, texture ); //this is done already by processResource
			if(LS.ResourcesManager.keep_files)
				texture._original_data = data;
		}
		URL.revokeObjectURL(objectURL); //free memory
		if(!texture)
			return;

		if(callback)
			callback(filename,texture,options);
	}

},"binary","Texture");

//special formats parser inside the system
LS.ResourcesManager.registerResourcePreProcessor("dds,tga", function(filename, data, options) {

	//clone because DDS changes the original data
	var cloned_data = new Uint8Array(data).buffer;
	var texture_data = Parser.parse(filename, cloned_data, options);	

	if(texture_data.constructor == Texture)
	{
		var texture = texture_data;
		texture.filename = filename;
		return texture;
	}

	var texture = LS.ResourcesManager.processImage(filename, texture_data);
	return texture;
}, "binary","Texture");


//Meshes ********
LS.ResourcesManager.processASCIIMesh = function(filename, data, options) {

	var mesh_data = Parser.parse(filename, data, options);

	if(mesh_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	var mesh = GL.Mesh.load(mesh_data);
	return mesh;
}

LS.ResourcesManager.registerResourcePreProcessor("obj,ase", LS.ResourcesManager.processASCIIMesh, "text","Mesh");
LS.ResourcesManager.registerResourcePreProcessor("stl", LS.ResourcesManager.processASCIIMesh, "binary","Mesh");

LS.ResourcesManager.processASCIIScene = function(filename, data, options) {

	var scene_data = Parser.parse(filename, data, options);

	if(scene_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	//resources (meshes, textures...)
	for(var i in scene_data.meshes)
	{
		var mesh = scene_data.meshes[i];
		LS.ResourcesManager.processResource( i, mesh );
	}

	//used for anims mostly
	for(var i in scene_data.resources)
	{
		var res = scene_data.resources[i];
		LS.ResourcesManager.processResource(i,res);
	}

	var node = new LS.SceneNode();
	node.configure(scene_data.root);

	LS.GlobalScene.root.addChild(node);
	return node;
}

LS.ResourcesManager.registerResourcePreProcessor("dae", LS.ResourcesManager.processASCIIScene, "text","Scene");







GL.Mesh.fromBinary = function( data_array )
{
	var o = null;
	if(data_array.constructor == ArrayBuffer )
		o = WBin.load( data_array );
	else
		o = data_array;

	var vertex_buffers = {};
	for(var i in o.vertex_buffers)
		vertex_buffers[ o.vertex_buffers[i] ] = o[ o.vertex_buffers[i] ];

	var index_buffers = {};
	for(var i in o.index_buffers)
		index_buffers[ o.index_buffers[i] ] = o[ o.index_buffers[i] ];

	var mesh = new GL.Mesh(vertex_buffers, index_buffers);
	mesh.info = o.info;
	mesh.bounding = o.bounding;
	if(o.bones)
	{
		mesh.bones = o.bones;
		//restore Float32array
		for(var i = 0; i < mesh.bones.length; ++i)
			mesh.bones[i][1] = mat4.clone(mesh.bones[i][1]);
		if(o.bind_matrix)
			mesh.bind_matrix = mat4.clone( o.bind_matrix );		
	}
	
	return mesh;
}

GL.Mesh.prototype.toBinary = function()
{
	if(!this.info)
		this.info = {};


	//clean data
	var o = {
		object_type: "Mesh",
		info: this.info,
		groups: this.groups
	};

	if(this.bones)
	{
		var bones = [];
		//convert to array
		for(var i = 0; i < this.bones.length; ++i)
			bones.push([ this.bones[i][0], mat4.toArray( this.bones[i][1] ) ]);
		o.bones = bones;
		if(this.bind_matrix)
			o.bind_matrix = this.bind_matrix;
	}

	//bounding box
	if(!this.bounding)	
		this.updateBounding();
	o.bounding = this.bounding;

	var vertex_buffers = [];
	var index_buffers = [];

	for(var i in this.vertexBuffers)
	{
		var stream = this.vertexBuffers[i];
		o[ stream.name ] = stream.data;
		vertex_buffers.push( stream.name );

		if(stream.name == "vertices")
			o.info.num_vertices = stream.data.length / 3;
	}

	for(var i in this.indexBuffers)
	{
		var stream = this.indexBuffers[i];
		o[i] = stream.data;
		index_buffers.push( i );
	}

	o.vertex_buffers = vertex_buffers;
	o.index_buffers = index_buffers;

	//create pack file
	var bin = WBin.create(o, "Mesh");

	return bin;
}

