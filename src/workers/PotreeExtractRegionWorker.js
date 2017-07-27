class PotreeExtractRegionWorker extends Worker{
	
	// box is a 4x4 matrix that specifies a transformation from a 
	// 1x1x1 box at the origin (coordinates from -0.5 to 0.)
	// to an oriented box in space. 
	// Points within that oriented box are considered "inside" and will be extracted.
	//
	constructor(pointclouds, box, minLevel, maxLevel){
		super();
		
		this.pointclouds = pointclouds;
		this.box = box;
		this.minLevel = minLevel;
		this.maxLevel = maxLevel;
	}
	
	start(){
		super.start();
		
		let purls = this.pointclouds.map(p => url.parse(p));
		let realPointcloudPaths = purls.map(p => settings.wwwroot + p.pathname.substr(1));
		
		logger.info(`realPointcloudPaths ${realPointcloudPaths}`);
		
		let year = this.started.getFullYear().toString();
		let month = (this.started.getMonth()+1).toString().padStart(2, "0");
		let day = this.started.getDate().toString().padStart(2, "0");
		let hours = this.started.getHours().toString().padStart(2, "0");
		let minutes = this.started.getMinutes().toString().padStart(2, "0");
		let seconds = this.started.getSeconds().toString().padStart(2, "0");
		
		if(this.user){
			let username = this.user ? this.user.substring(this.user.lastIndexOf("\\") + 1) : "anonymous";
			this.name = `${year}.${month}.${day}_${hours}.${minutes}.${seconds}_${username}`;
		}else{
			this.name = `${year}.${month}.${day}_${hours}.${minutes}.${seconds}`;
		}
		this.outDir = `${settings.outputDirectory}/${this.uuid}`;
		this.outPath = `${settings.outputDirectory}/${this.uuid}/${this.name}.las`;

		//logger.info("realPointcloudPath", realPointcloudPath);
		
		let args = [
			...realPointcloudPaths,
			"--box", this.box,
			"--min-level", this.minLevel, 
			"--max-level", this.maxLevel, 
			"-o", this.outPath,
			"--metadata", this.user,
		];
		
		//logger.info("spawing region extraction task with arguments: ");
		//logger.info(args);
		
		let process = spawn(getExtractRegionExe(), args, {shell: false, detached: true});
		process.on('close', (code) => {
			//this.done();
			this.archive();
		});
	}
	
	archive(){
		
		this.archivePath = `${settings.outputDirectory}/${this.uuid}/${this.name}.zip`;
		
		logger.info(`archiving results to ${this.archivePath}`);
		
		let output = fs.createWriteStream(this.archivePath);
		let archive = archiver('zip', {
			zlib: { level: 1 }
		});

		output.on('close', () => {
			logger.info("archiving finished");
			this.done();
		});
		
		archive.on('warning', function(err) {
			logger.info(`WARNING: encountered a problem while archiving results ${err.code}`);
		});
		
		archive.on('error', function(err) {
			logger.info(`ERROR: encountered a problem while archiving results ${err.code}`);
		});
		
		archive.pipe(output);
		
		let metadata = {
			user: this.user,
			started: this.started.toISOString(),
			ended: this.started.toISOString(),
		};
		
		archive.append(fs.createReadStream(this.outPath), { name: `${this.name}.las` });
		archive.append(JSON.stringify(metadata, null, "\t"), { name: 'metadata.txt' });
		
		archive.finalize();
	}
	
	done(){
		super.done();
		
		// delete artifacts after an hour, to avoid clogging the filesystem
		setTimeout(this.deleteArtifacts.bind(this), settings.deleteArtifactsAfter)
	}
	
	deleteArtifacts(){
		
		// make sure we don't accidentally delete things like "/" or "C:/"
		if(this.outPath.length < 5 || this.archivePath < 5 || this.outDir.length < 5){
			logger.info(`artifacts not deleted because they appeared unsafe: ${this.outDir}`);
			return;
		}
		
		fs.unlink(this.outPath, () => {
			fs.unlink(this.archivePath, () => {
				fs.rmdir(this.outDir, () => {});
			});
		});
	}
	
	cancel(){
		super.cancel();
	}
	
	getStatus(){
		
		let status = super.getStatus();
		
		if(this.status === workerStatus.FINISHED){
			status.link = `./get_las?workerID=${this.uuid}`;
		}
		
		return status;
	}
	
	statusPage(){
		
		let finished = this.finished ? this.finished.toLocaleString() : "no yet";
		
		let content = "";
		if([workerStatus.FINISHED, workerStatus.CANCELED].includes(this.status)){
			// TODO URL is hardcoded!!
			let downloadLink = `./get_las?workerID=${this.uuid}`;
			content = `
			Extracted profile is available for download at: <br>
			<a href="${downloadLink}">${downloadLink}</a>
			`;
		}else{
			content = `Region extraction in progress.`;
		}
		
		let page = `
		<html>
		<style>${css}</style>
		<body>
		
		<div class="centering">
		<div class="panel">
			<span id="titlebar" class="titlebar">Region Extraction - Status</span>
			<span id="workerdata" class="workerdata">
				<table>
					<tr>
						<td>uuid</td>
						<td>${this.uuid}</td>
					</tr>
					<tr>
						<td>started</td>
						<td>${this.started.toLocaleString()}</td>
					</tr>
					<tr>
						<td>finished</td>
						<td>${finished}</td>
					</tr>
				</table>
			</span>
			<span id="content" class="content">
				${content}
			</span>
		</div>
		</div>	
		
		</body>
		</html>
		`;
		
		return page;
	}
};