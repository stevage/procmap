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

function setSeedXY(x, y) {
    setSeed(hashSeed(x, y));
}

function random(seed) {
    return rng.uFloat32()
}

function random0(seed) {
    return rng.uFloat32() - 0.5;
}


const scale = 50; // 50
 
function pointsForBounds([minx, miny, maxx, maxy]) {
    const q = t => Math.floor(t * scale);// / scale;
    const points = [];
    const buffer = 10;
    for (let x = q(minx) - buffer; x <= q(maxx)+buffer; x ++) {
        for (let y = q(miny) - buffer; y <= q(maxy)+buffer; y ++) {
            const [cx, cy] = townCoords(x, y);
            if (cx < minx || cy < miny || cx >= maxx || cy >= maxy) {
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

function townCoords(x, y) {
    // function wrap(z, min, max) {
    //     const range = (max - min) * scale;
    //     return (z - min* scale ) % range + min * scale;
    // }
    setSeedXY(x, y);
    const M = 1;
    const coords = [
        (x + random0() * M) / scale, 
        (y + random0() * M + (x % 2) * 0.5) / scale, 
    ];
    return coords;
}

function town([x, y]) {
    const seed = hashSeed(x, y);
    setSeed(seed);
    const props = {
        type: 'town',
        seed,
        name: fakeName({seed}),
        size: Math.ceil(random()*random()*random()*5)
    };
    
    return makePoint(townCoords(x, y), props)
}

function road(townA, townB) {
    function complexify(coords) {
        function midpoint(a, b) {
            const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1])  * (b[1] - a[1]));
            // const M = 4;
            const M = 0.4 / maxsize; // decrease for less wiggliness
            return [
                (b[0] - a[0]) / 2 + a[0] - random0() * l * M, 
                (b[1] - a[1]) / 2 + a[1] - random0() * l * M
            ];
        }
        const out = [];
        coords.forEach((coord, i) => {
            out.push(coord);
            const next = coords[i + 1];
            if (next) {
                const mid = midpoint(coord, next);
                out.push(mid);
            }
        });
        // console.log(out);
        return out;
    }
    setSeed(townA.properties.seed);
    const minsize = Math.min(townA.properties.size, townB.properties.size);
    const maxsize = Math.max(townA.properties.size, townB.properties.size);
    return {
        type: 'Feature',
        properties: {
            type: 'road',
            minsize,
            maxsize,
        }, 
        geometry: {
            type: 'LineString',
            coordinates: complexify(complexify(complexify(complexify(complexify(complexify(complexify([townA.geometry.coordinates, townB.geometry.coordinates])))))))
        }
    }
}

const dist2 = (a, b) => (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) ;
/*
TODO: make roads connect across tile boundaries. I think if we are careful to make each road connection symmetric, and construct
each road in the same direction, then they should end up joining. I hope.
*/
function makeRoads(bounds) {
    
    /* Determines if two towns should be connected by road */
    function connect(a, b) {
        const d2 = dist2(a.geometry.coordinates, b.geometry.coordinates) * scale * scale;
        // console.log(1/d2/scale/scale);
        // console.log(d2,1/(d2+1));
        const A = 0.75;  //0.75// increase for more towns in general
        const B = 0.25; //0.25// decrease for more bias towards nearby towns connected
        const C = 20; //20// decrease for greater connectivity for large towns
        const maxsize = Math.max(a.properties.size, b.properties.size);
        return random() < A/(d2 + B) + maxsize/C;
        // if (a.properties.size === b.properties.size) {
        //     if (random() > d2 * scale * scale) {
        //         return true;
        //     }
        // }
        // return random() < Math.max(a.properties.size, b.properties.size * 2) / 7
    }

    function order(tx1, ty1, tx2, ty2) {
        if (tx1 < tx2 || tx1 === tx2 && ty1 < ty2) {
            return [[tx1, ty1], [tx2, ty2]];
        } else {
            return [[tx2, ty2], [tx1, ty1]];
        }
    }

    const roads = [];
    pointsForBounds(bounds).forEach(([x,y]) => {
        for (let tx = x - 1; tx <= x + 1; tx ++) {
            for (let ty = y - 1; ty <= y + 1; ty ++) {
                if (tx === x && ty === y) {
                    continue;
                }
                // put the towns in consistent order regardless of which is "our" town
                const [town1, town2] = order(x, y, tx, ty).map(town);
                setSeedXY(...town1.geometry.coordinates);

                if (connect(town1, town2)) {
                    roads.push(road(town1, town2))
                }


        // const [a, b, c, d, e] = [town(x-1, y, bounds), town(x, y, bounds), town(x, y-1, bounds), town(x-1, y-1, bounds), town(x-1, y+1, bounds)];
        // if (connect(a, b) && /*a.properties.size === b.properties.size && */a.geometry.coordinates[0] < b.geometry.coordinates[0] ) {
        //     roads.push(road(a, b))
        // }
        // if (connect(c, b) / 5 && /*b.properties.size === c.properties.size && */c.geometry.coordinates[1] < b.geometry.coordinates[1]) {
        //     roads.push(road(c, b))
        // }
        /*if (d.geometry.coordinates[0] < b.geometry.coordinates[0] && d.geometry.coordinates[1] < b.geometry.coordinates[1]) {
            roads.push(road(d, b))
        }
        if (e.geometry.coordinates[0] < b.geometry.coordinates[0] && e.geometry.coordinates[1] > b.geometry.coordinates[1]) {
            roads.push(road(e, b))
        }*/
            }
        }
    });
    console.log(`${roads.length} roads.`);
    return roads;
}

function makeTowns(bounds) {
    const towns = [];
    pointsForBounds(bounds).forEach(([x,y]) => {        
        towns.push(town([x, y]))
    });
    console.log(`${towns.length} towns.`);
    return towns;
}


module.exports = function dataForBounds(bounds) {
    return {
        type: 'FeatureCollection',
        features: [...makeTowns(bounds), ...makeRoads(bounds)]
    };
}
