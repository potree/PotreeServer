
# Development

install dependencies from package.json

    npm install

start server

    cd build/potree_server
    node potree_server.js

watch and rebuild/restart on changes in source 

    gulp watch


# Installation

Copy build/potree_server to any location

Install dependencies form package.json and run server

    npm install 
	node potree_server.js 
	
Alternatively, you can use pm2 to manage the server process 

    npm install 
	npm install pm2 -g 
	pm2 start potree_server.js 
	
	# list running processes 
	pm2 list 
	
	# stop process by name 
	pm2 stop potree_server




