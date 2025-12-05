;module.exports = function(a, own){
	const { BlobServiceClient, StorageSharedKeyCredential } = require("@azure/storage-blob");
	const { Readable } = require('stream');

	function AzureBlob(opt){

		if(!(this instanceof AzureBlob)){
			return new AzureBlob(opt);
		}
        
		var az = this;
		opt = opt || {};
		opt.accountName = opt.accountName || process.env.AZURE_BLOB_ACCOUNT_NAME;
		opt.accountKey = opt.accountKey || process.env.AZURE_BLOB_ACCOUNT_KEY;
		opt.containerName = opt.containerName || process.env.AZURE_BLOB_CONTAINER_NAME;

		if(!opt.accountName || !opt.accountKey || !opt.containerName){
			console.log("Azure Blob Storage options (accountName, accountKey, containerName) or environment variables are required.");
			return 0;
		}
		az.config = opt;
		az.on = a.on;

		const storageAccountBaseUrl = `https://${az.config.accountName}.blob.core.windows.net`;
		const sharedKeyCredential = new StorageSharedKeyCredential(az.config.accountName, az.config.accountKey);

		const blobServiceClient = new BlobServiceClient(
			storageAccountBaseUrl,
			sharedKeyCredential
		);

		az.containerClient = blobServiceClient.getContainerClient(az.config.containerName);
		
		// Check if the container exists, if not, create it
		az.containerClient.exists().then((exists) => {
			if (!exists) {
				return az.containerClient.create();
			}
		}).then(() => {
			console.log(`Blob container '${az.config.containerName}' is ready.`);
		}).catch((error) => {
			console.error("Error with container setup:", error);
		});

		return az;
	};

	AzureBlob.id = function(m){ return m.containerName +'/'+ m.key }
	AzureBlob.chain = AzureBlob.prototype;
	AzureBlob.chain.PUT = async function(key, o, cb){
		if(!key){ return }
		var data;
		if(Object.plain(o) || Array.isArray(o)){
			data = JSON.stringify(o);
		} else {
			data = (typeof o === 'string')? o : JSON.stringify(o);
		}

		try {
			const blobClient = this.containerClient.getBlockBlobClient(key);
			await blobClient.upload(data, data.length);
			if(cb){ cb(null, {ok: true}) }
		} catch(e) {
			if(cb){ cb(e) }
		}
		return this;
	}
	AzureBlob.chain.GET = function(key, cb){
		if(!key){ return }
		var az = this
		, m = {
			containerName: az.config.containerName
			,key: key
		}, id = AzureBlob.id(m);
		az.on(id, function(arg){
			var e = arg[0], d = arg[1], t = arg[2], m = arg[3], r = arg[4];
			this.off();
			delete az.batch[id];
			if(!a.fn.is(cb)){ return }
			try{ cb(e, d, t, m, r);
			}catch(e){
				console.log(e);
			}
		});
		az.batch = az.batch || {};
		if(az.batch[id]){ return az }
		az.batch[id] = (az.batch[id] || 0) + 1;
		
		(async function(){
			try {
				const blobClient = az.containerClient.getBlockBlobClient(key);
				const downloadResponse = await blobClient.download(0);
				const downloadedData = [];
				for await (const chunk of downloadResponse.readableStreamBody) {
					downloadedData.push(chunk);
				}
				const t = Buffer.concat(downloadedData).toString('utf8');
				var d;
				try { d = JSON.parse(t); } catch(e) { d = t; }
				az.on(id, [null, d, t, downloadResponse.metadata, downloadResponse]);
			} catch(e) {
				az.on(id, [e]);
			}
		}());
		return az;
	}

	AzureBlob.chain.del = async function(key, cb){
		if(!key){ return }
		try {
			const blobClient = this.containerClient.getBlockBlobClient(key);
			const r = await blobClient.delete();
			if(cb){ cb(null, r) }
		} catch(e) {
			if(cb){ cb(e) }
		}
		return this;
	}

	AzureBlob.chain.keys = async function(prefix, cb){
		cb = cb || prefix;
		var opts = {};
		if(typeof prefix === 'string'){
			opts.prefix = prefix;
		}

		try {
			const blobs = [];
			for await (const blob of this.containerClient.listBlobsFlat(opts)) {
				blobs.push(blob.name);
			}
			if(typeof cb === 'function'){
				cb(null, blobs);
			}
		} catch(e) {
			if(typeof cb === 'function'){
				cb(e);
			}
		}
		return this;
	}
	return AzureBlob;
};
/**
Azure Blob Storage config is:
 {
	accountName: process.env.AZURE_BLOB_ACCOUNT_NAME = ''
	,accountKey: process.env.AZURE_BLOB_ACCOUNT_KEY = ''
	,containerName: process.env.AZURE_BLOB_CONTAINER_NAME = ''
}
**/
