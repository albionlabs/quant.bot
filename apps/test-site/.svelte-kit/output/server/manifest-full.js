export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.7EIABrf6.js",app:"_app/immutable/entry/app.DCXR4GKb.js",imports:["_app/immutable/entry/start.7EIABrf6.js","_app/immutable/chunks/CB2e2diY.js","_app/immutable/chunks/CVDMdypd.js","_app/immutable/chunks/CTvscISp.js","_app/immutable/entry/app.DCXR4GKb.js","_app/immutable/chunks/DNy9XLNB.js","_app/immutable/chunks/CVDMdypd.js","_app/immutable/chunks/BVGcaUsn.js","_app/immutable/chunks/CTvscISp.js","_app/immutable/chunks/D88W2jO2.js","_app/immutable/chunks/vh6RyPJP.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:true},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
