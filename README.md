
Status: experimental / crashy


# Installation / Build


1.) Install dependencies as specified package.json

    npm install --save

2.) Open settings.json and adjust values for path and outputDirectory.

Path points to the root folder of your main/file server. Potree server will attempt to look for point clouds relative to this location. 

OutputDirectory is where the filter results will be stored. At this time, this folder won't automatically be cleared of past results so you have to make sure to clean it up manually.


3.) Run the server:



	node ./src/potree_server.js
	

