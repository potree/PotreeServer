
log4js.configure({
	appenders: {
		out: { 
			type: 'stdout', 
			layout: {
				type: 'pattern',
				pattern: '%[ %d %p %m %]' 
			}},
		app: { 
			type: 'file', 
			filename: `${__dirname}/potree_server.log`, 
			layout: {
				type: 'pattern',
				pattern: '%d %p %m' 
			},
			maxLogSize: 52428800, backups: 5, compress: true
		}
	},
	categories: {
		default: { appenders: [ 'out', 'app' ], level: 'debug' }
	}
});

const logger = log4js.getLogger();

process.on('uncaughtException', function(err) {
    logger.error(err);
    process.exit(1);
});

console.log = function(...args){
	logger.info(args.join(" "));
};

console.error = function(...args){
	logger.error(args.join(" "));
};


logger.info(`filename ${__filename}`);
logger.info(`dirname ${__dirname}`);

let settingsPath = `${__dirname}/settings.json`;
let settings = null;

logger.info("starting potree server");
logger.info(`Using settings from: '${settingsPath}'`);

if(fs.existsSync(settingsPath)){
	settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}else{
	logger.error(`No settings found at: '${settingsPath}'`);
	process.exit()
}

// process.title = `potree_server started by ${os.userInfo().username} at port ${settings.port}`;
// process.title = `test`;

