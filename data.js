const tilebelt = require('@mapbox/tilebelt');
const hash = require("number-generator/lib/murmurhash3_x86_32");
const rng = require("number-generator/lib/aleaRNGFactory")();
const fakeName = require('fake-town-name');

const seeds = {}

function hashSeed(x, y) {
    return hash(`${x}${y}`);
}

function setSeed(seed) {
    rng.setSeed(seed);
}

function random(seed) {
    return rng.uFloat32()
}

const scale = 50;
 
function pointsForBounds([minx, miny, maxx, maxy]) {
    const q = t => Math.floor(t * scale) / scale;
    const points = [];
    for (let x = q(minx); x <= q(maxx); x += 1/ scale) {
        for (let y = q(miny); y <= q(maxy); y += 1/ scale) {
            if (x < minx || y < miny || x >= maxx || y >= maxy) {
                continue;
            }
            points.push([x,y]);
        }
    };
    return points;
}

function makePoint(coordinates, properties) {
    return {
        type: 'Feature',
        properties,
        geometry: {
            type: 'Point',
            coordinates
        }
    }
}

function town(x, y, [minx, miny, maxx, maxy]) {
    // unsolved problem: by constraining the x/y to the bounding box for a tile, the generated data becomes scale dependent
    // so as we zoom in/out, points near the edges of tiles jump around
    function wrap(z, min, max) {
        const range = max - min;
        return (z - min) % range + min;
    }


    const seed = hashSeed(Math.round(x * scale), Math.round(y * scale));
    setSeed(seed);
    const props = {
        name: fakeName({seed}),
        size: Math.ceil(random()*random()*random()*5)
    };
    const coords = [
        wrap(x + random() /scale, minx, maxx), 
        wrap(y + random() /scale, miny, maxy), 
    ];
    return makePoint(coords, props)

}

module.exports = function dataForBounds([minx, miny, maxx, maxy]) {

    const features = [];
    pointsForBounds([minx, miny, maxx, maxy]).forEach(([x,y]) => {
        
        features.push(town(x, y, [minx, miny, maxx, maxy]))
    });
    console.log(`${features.length} points.`);
    return {
        type: 'FeatureCollection',
        features
    };
}

