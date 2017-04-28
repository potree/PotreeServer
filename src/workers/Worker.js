function findWorker(uuid){
	let activeWorker = workers.active.get(uuid);
	
	if(activeWorker){
		return activeWorker;
	}
	
	let finishedWorker = workers.finished.get(uuid);
	
	if(finishedWorker){
		return finishedWorker;
	}
	
	return null;
}

const workerStatus = {
	INACTIVE: 0,
	ACTIVE: 1,
	CANCELED: 2,
	FINISHED: 3
}

class Worker{
	constructor(){
		this.uuid = uuid.v4();
		this.started = new Date();
		this.finished = null;
		this.status = workerStatus.INACTIVE;
	}
	
	start(){
		workers.active.set(this.uuid, this);
		this.status = workerStatus.ACTIVE;
	}
	
	cancel(){
		workers.active.delete(this.uuid);
		workers.finished.set(this.uuid, this);
		this.finished = new Date();
		this.status = workerStatus.CANCELED;
	}
	
	done(){
		workers.active.delete(this.uuid);
		workers.finished.set(this.uuid, this);
		this.finished = new Date();
		this.status = workerStatus.FINISHED;
	}
	
	getStatusString(){
		let status = Object.keys(workerStatus).filter(key => workerStatus[key] === this.status)[0];
		return status;
	}
	
	statusPage(){
		
		
		let page = `
		<html>
		<body>
		
			worker id: ${this.uuid}<br>
			started at: ${this.started.toLocaleString()}<br>
			status: ${this.getStatusString()}
		
		</body>
		</html>
		`;
		
		return page;
	}
};