const tilebelt = require('@mapbox/tilebelt');
const hash = require("number-generator/lib/murmurhash3_x86_32");
const rng = require("number-generator/lib/aleaRNGFactory")();
const fakeName = require('fake-town-name');

const cantor = (x, y) => 0.5 * (x + y) * (x + y + 1) + y;
const seeds = {}
function seedify(x,y) {
    const s = ((x % (2 << 15)) << 16) + (y % (2 << 15))
    if (s === 0) { 
        console.log('0!', x, y);
    }
    if (seeds[s]) {
        // console.warn('Repeated seed!', seeds[s], [x,y]);
    }
    seeds[s] = [x,y];
    return s;
}

function hashSeed(x, y) {
    // return hash(String(seedify(Math.round(x), Math.round(y))));
    console.log(`${x}${y}`);
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
                // console.log('Out of bounds',x,y);
                continue;
            }
            // console.log('Ok',x,y);

            points.push([x,y]);
        }
    };
    return points;
}

function makePoint(coordinates, seed) {
    const hex = () => '0123456789abcdef'[Math.floor(random()*16)];
    return {
        type: 'Feature',
        properties: {
            // 'marker-color': `hsl(${random() * 360},${50 + random() * 50}%,${random() * 30 + 30}%)`,
            'marker-color': `#${hex()}${hex()}${hex()}`,
            'marker-symbol': 'circle',
            'marker-size': 'medium',
            name: fakeName({seed}),
            size: Math.ceil(random()*random()*random()*5)
        },
        geometry: {
            type: 'Point',
            coordinates
        }
    }
}

module.exports = function dataForBounds([minx, miny, maxx, maxy]) {
    function wrap(x, min, max) {
        const range = max - min;
        return (x - min) % range + min;
    }

    const features = [];
    pointsForBounds([minx, miny, maxx, maxy]).forEach(([x,y]) => {
        const seed = hashSeed(Math.round(x * scale), Math.round(y * scale))
        setSeed(seed);

        const coords = [
            wrap(x + random() /scale, minx, maxx), 
            wrap(y + random() /scale, miny, maxy), 
        ];
        features.push(makePoint(coords, seed))
    });
    console.log(`${features.length} points.`);
    return {
        type: 'FeatureCollection',
        features
    };
}

