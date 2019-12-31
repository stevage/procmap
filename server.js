const vtpbf = require('vt-pbf');
const geojsonVt = require('geojson-vt');
const express = require('express');
const cors = require('cors');
const tilebelt = require('@mapbox/tilebelt');
const compression = require('compression');

const makeData = require('./data');



const MAXZOOM = 20;   // Maximum level we will generate and serve vector tiles for
const MINZOOM = 6;   // Minimum level we will generate and serve vector tiles for


const app = express();
app.use(cors());
app.use(compression()); // doesn't seem to work on pbf?

app.get('/grid/:z/:x/:y.:format', (req, res) => {
    const p = req.params;
    const [x, y, z] = [+req.params.x, +req.params.y, +req.params.z];
    if (z < MINZOOM) {
        return res.status(404).send('Zoom too low').end();
    }
    // generate the geometry spanning the required area
    const tileContents = makeData(tilebelt.tileToBBOX([x, y, z]))
    
    if (req.params.format === 'geojson') {
        res.send(tileContents);
        return;
    }
    // convert it into vector tiles
    const gridTiles = geojsonVt(tileContents, {
        maxZoom: z,
        indexMaxZoom: z,
        buffer: 0,
        indexMaxPoints: 1e7
    });
    console.log(gridTiles.tileCoords);
    
    // select the one vector tile actually requested
    const requestedTile = gridTiles.getTile(z, x, y);
    if (!requestedTile) {
        return res.status(404).send('No tile').end();
    }

    if (req.params.format === 'pbf') {
        // turn it into a PBF
        const buff = vtpbf.fromGeojsonVt({ grid: requestedTile }); // "grid" is the layer name
        
        // send it back
        res.type('application/vnd.mapbox-vector-tile')
            .send(Buffer.from(buff))
            .end();
    } else if (req.params.format === 'json') {
        res.send(requestedTile);
    // } else if (req.params.format === 'geojson') {
    //     res.send(tileContents);
    } else {
        res.status(400).send('Unsupported format');
    }
    
}); 

const listener = app.listen(3031, function() {
    // test URL /grid/18/236602/160844.json
    console.log('Running procmap server on port ' + listener.address().port);
});