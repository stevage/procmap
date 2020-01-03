const vtpbf = require('vt-pbf');
const geojsonVt = require('geojson-vt');
const express = require('express');
const cors = require('cors');
const tilebelt = require('@mapbox/tilebelt');
const compression = require('compression');

const makeData = require('./data');

const MAXZOOM = 20;   // Maximum level we will generate and serve vector tiles for
const MINZOOM = 8;   // Minimum level we will generate and serve vector tiles for

const app = express();
app.use(cors());
app.use(compression()); // doesn't seem to work on pbf

app.get('/grid/:z/:x/:y.:format', (req, res) => {
    const p = req.params;
    const [x, y, z] = [+req.params.x, +req.params.y, +req.params.z];
    if (z < MINZOOM) {
        return res.status(404).send('Zoom too low').end();
    }
    // generate the geometry spanning the required area
    const tileContents = makeData(tilebelt.tileToBBOX([x, y, z]), z)
    
    if (req.params.format === 'geojson') {
        // if they want raw geojson, skip the tile generation process
        res.send(tileContents);
        return;
    }
    // convert it into vector tiles
    const gridTiles = geojsonVt(tileContents, {
        maxZoom: z,
        indexMaxZoom: z,
        buffer: 4096,
        indexMaxPoints: 1e7
    });

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
    } else {
        res.status(400).send('Unsupported format');
    }
}); 
app.get('/', (req, res)=> {
    // res.send(`
    //     <!DOCTYPE html>
    //     <html lang="en">
    //     <head>
    //         <script>
    //         window.location.replace('https://stevage.github.io/alt-world');
    //         </script>
    //     </head>
    //     <body>
    //         Redirecting to <a href="https://stevage.github.io/alt-world">https://stevage.github.io/alt-world</a>.
    //     </body>
    //     </html>
    // `);
    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <style>
        html, body {
            height: 100%;
            overflow: hidden;
            margin: 0;
            padding: 0;
        }
        iframe {
            position: absolute;
            left: 0;
            right: 0;
            bottom:0;
            top: 0;
        }
        
        </style>
    </head>
    <body>
        <iframe frameborder="0" src="https://stevage.github.io/alt-world">
    </body>
    </html>
    `);
})
  
const listener = app.listen(3031, function() {
    // test URL /grid/18/236602/160844.json
    console.log('Running procmap server on port ' + listener.address().port);
});