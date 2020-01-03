const tilebelt = require('@mapbox/tilebelt');
const hash = require("number-generator/lib/murmurhash3_x86_32");
const rng = require("number-generator/lib/aleaRNGFactory")();
const fakeName = require('fake-town-name');
const SimplexNoise = require('simplex-noise')
const simplex = new SimplexNoise('seed');
const seeds = {}
const turf = require('@turf/turf');
const perf = require('execution-time')();
require('colors');
function hashSeed(x, y) {
    return hash(`${x}${y}`);
}

function setSeed(seed) {
    rng.setSeed(seed);
}

function setSeedString(s) {
    rng.setSeed(hashSeed(s));
}

function setSeedXY(x, y) {
    setSeed(hashSeed(x, y));
}

function random() {
    return rng.uFloat32()
}

function random0() {
    return rng.uFloat32() - 0.5;
}


const scale = 50; // 50
 
function pointsForBounds([minx, miny, maxx, maxy], clip=true, localScale = scale) {
    const q = t => Math.floor(t * localScale);// / scale;
    const points = [];
    const buffer = 1;
    for (let x = q(minx) - buffer; x <= q(maxx)+buffer; x ++) {
        for (let y = q(miny) - buffer; y <= q(maxy)+buffer; y ++) {
            const [cx, cy] = townCoords(x, y);
            if (clip && (cx < minx || cy < miny || cx >= maxx || cy >= maxy)) {
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
    // const M = 1; //###
    const M = 1;
    const coords = [
        (x + random0() * M) / scale, 
        (y + random0() * M /*+ (x % 2) * 0.5*/) / scale, 
    ];
    return coords;
}

function makeTown([x, y]) {
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

function notUnderwaterTown(townxy, waterPolys) {
    return !waterPolys.find(waterPoly => turf.booleanPointInPolygon(townCoords(...townxy), waterPoly))
}


function makeTowns(bounds, waterPolys) {
    perf.start('towns');
    const towns = pointsForBounds(bounds)
        .filter(t => notUnderwaterTown(t, waterPolys))
        .map(makeTown);

        perfReport(towns.length, 'towns');
    
    // console.log(`${towns.length} towns in ${Math.round(perf.stop('towns').time)}ms.`);
    

    return towns;
}


/* Make a series of coordinates more wiggle */
function complexify(coords, times, wiggliness) {
    function midpoint(a, b) {
        const l = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1])  * (b[1] - a[1]));
        return [
            (b[0] - a[0]) / 2 + a[0] - random0() * l * wiggliness, 
            (b[1] - a[1]) / 2 + a[1] - random0() * l * wiggliness
        ];
    }
    if (times < 1) {
        return coords;
    }
    setSeedString(String(coords[0]));
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
    if (times > 1) {
        return complexify(out, times - 1, wiggliness);
    } else {
        return out;
    }
}

function road(townA, townB, complexity, waterPolys) {
    function roadFeature(coordinates, bridge='') {
        return {
            type: 'Feature',
            properties: {
                type: 'road',
                minsize,
                maxsize,
                bridge 
            }, 
            geometry: {
                type: 'LineString',
                coordinates
                // coordinates: complexify(straightRoad, complexity, 0.4 / (minsize + maxsize) * 2)
            }
        };
    }

    /* water/land transition points can be in any order, so we sort by distance from the start */
    function sortBridgePoints(bridgePoints) {
        const [x, y] = bridgePoints[0];
        return bridgePoints.sort(([ax, ay], [bx, by]) =>
            ((ax - x) * (ax - x) + (ay - y) * (ay - y)) -
            ((bx - x) * (bx - x) + (by - y) * (by - y))
        );
    }


    setSeed(townA.properties.seed);
    const minsize = Math.min(townA.properties.size, townB.properties.size);
    const maxsize = Math.max(townA.properties.size, townB.properties.size);
    const straightRoad = [townA.geometry.coordinates, townB.geometry.coordinates];
    const straightRoadLine = { type: 'LineString', coordinates: straightRoad }
    let bridgePoints = [];
    for (let water of waterPolys) {
        if (turf.booleanCrosses(water.geometry, straightRoadLine)) {
            bridgePoints.push(...turf.lineIntersect(water, straightRoadLine).features.map(f => f.geometry.coordinates));
        }
    }
    bridgePoints = [townA.geometry.coordinates, ...bridgePoints, townB.geometry.coordinates];
    let onBridge = false;
    let roadSegments = [];
    const roadFeatures = []; 
    const bridgeCount = bridgePoints.length / 2;

    
    bridgePoints = sortBridgePoints(bridgePoints);

    bridgePoints.forEach((coord, i) => {
        nextCoord = bridgePoints[i+1];
        if (!nextCoord) {
            return;
        }
        if (!onBridge) {
            // TODO this duplicates transition points
            roadFeatures.push(roadFeature(complexify([coord, nextCoord], complexity - bridgeCount, 0.4 / (minsize + maxsize) * 2)));
        } else {
            const d2 = dist2(coord, nextCoord);
            // console.log(d2);
            if (d2 > 0.00004) {
                roadFeatures.push(roadFeature(complexify([coord, nextCoord], 2, 0.2), 'ferry'));
            } else {
                roadFeatures.push(roadFeature([coord, nextCoord], 'bridge'));
            }
            // roadPoints = [...roadPoints, coord, nextCoord];
        }
        onBridge = !onBridge;

    });

    // if (bridgePoints.length) {
    //     console.log(bridgePoints);
    // }
    return roadFeatures
}

const dist2 = (a, b) => (b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]) ;
/*
TODO: make roads connect across tile boundaries. I think if we are careful to make each road connection symmetric, and construct
each road in the same direction, then they should end up joining. I hope.
*/
function makeRoads(bounds, zoom, waterPolys) {
    
    /* Determines if two towns should be connected by road */
    function connect(a, b) {
        const d2 = dist2(a.geometry.coordinates, b.geometry.coordinates) * scale * scale;
        const A = 0.75; // increase for more roads in general
        const B = 0.25; // decrease for more bias towards nearby towns connected
        const C = 20;   // decrease for greater connectivity for large towns
        const maxsize = Math.max(a.properties.size, b.properties.size);
        return random() < A/(d2 + B) + maxsize/C;
    }

    function order(tx1, ty1, tx2, ty2) {
        if (tx1 < tx2 || tx1 === tx2 && ty1 < ty2) {
            return [[tx1, ty1], [tx2, ty2]];
        } else {
            return [[tx2, ty2], [tx1, ty1]];
        }
    }
    const complexity =  zoom * 2 - 18 ; // 7
    const roads = [];
    perf.start('roads');
    // console.log('Road complexity', complexity);
    // TODO try to avoid drawing every road twice?
    pointsForBounds(bounds, false).forEach(([x,y]) => {
        for (let tx = x - 1; tx <= x + 1; tx ++) {
            for (let ty = y - 1; ty <= y + 1; ty ++) {
                if (tx === x && ty === y) {
                    continue;
                }
                // put the towns in consistent order regardless of which is "our" town
                const [town1, town2] = order(x, y, tx, ty).map(makeTown);
                if (notUnderwaterTown([x, y], waterPolys) && notUnderwaterTown([tx, ty], waterPolys)) {
                    setSeedXY(...town1.geometry.coordinates);

                    if (connect(town1, town2)) {
                        roads.push(...road(town1, town2, complexity,waterPolys))
                    }
                }

            }
        }
    });
    // console.log(`${roads.length} roads (complexity ${complexity}) in ${Math.round(perf.stop('makeroads').time)}ms`);
    perfReport(roads.length, 'roads', `(complexity ${complexity})`);

    return roads;
}

function makePolys(bounds, polyScale, type, complexity, ratio = 0.0125, wiggleFactor) {
    
    const s = z => z / polyScale;
    function xy(x, y) {
        setSeedXY(x, y);
        const M = 0;
        return [(x + M*random0()) / polyScale, (y +  M*random0()) / polyScale];
    }
    function water(coordinates) {
        const u = turf.combine(turf.unkinkPolygon({
            type: 'Feature',
            properties: {
                type: type,
            },
            geometry: turf.rewind({
                type: 'Polygon',
                coordinates 
            })
        })).features[0];
        u.properties = { type }
        // console.log(u);
        return u;
        ;
    }
    const waters = [];
    const isWater = coord => simplex.noise2D(coord[0]/10, coord[1]/10) + 1 < ratio * 2;
    // console.log(`Poly ${type} complexity ${complexity}`);
    perf.start(type);
    pointsForBounds(bounds, false, polyScale).forEach(([x,y]) => {
        setSeedXY(x,y);
        const corners = [[x,y], [x+1,y],[x+1,y+1], [x,y+1]];
        const N = 1; // 1 // how far within the cell the midpoint can be
        const cp = xy(x + random(), y + random()); // Whoa, this should really be XY. lol.

        const W = /*random() * */wiggleFactor;
        if (isWater(corners[0]) && isWater(corners[1]) && isWater(corners[2]) && isWater(corners[3])) {
            waters.push(water([[
                xy(x, y, 0, 0),
                xy(x+1, y, 0, 0),
                xy(x+1, y+1),
                xy(x, y+1),
                xy(x, y, 0, 0)
            ]]));
        } else {
            // return waters
            if (isWater(corners[0]) && isWater(corners[3])){// && !isWater(corners[2]) && !isWater(corners[1])) {
                // left is water, right is not
                waters.push(water([[
                    ...complexify([xy(x, y, 0, 0), cp, xy(x, y+1)], complexity, W),
                    xy(x, y, 0, 0)
                ]]));
            } 
            if (isWater(corners[1]) && isWater(corners[2])){// && !isWater(corners[0]) && !isWater(corners[3])) {
                // right is water, left is not
                waters.push(water([[
                    ...complexify([xy(x+1, y), cp, xy(x+1, y+1)], complexity, W),
                    xy(x+1, y)
                ]]));
            } 
            if (isWater(corners[2]) && isWater(corners[3])){// && !isWater(corners[0]) && !isWater(corners[1])) {
                // up is water, down is not
                waters.push(water([[
                    ...complexify([xy(x, y+1), cp, xy(x+1, y+1)], complexity, W),
                    xy(x, y+1)
                ]]));
            }
            if (isWater(corners[0]) && isWater(corners[1])){// && !isWater(corners[2]) && !isWater(corners[3])) {
                // down is water, up is not
                waters.push(water([[
                    ...complexify([xy(x, y, 0, 0), cp, xy(x+1, y)], complexity, W),
                    xy(x, y, 0, 0)
                ]]));
            }
        }
    });
    perfReport(waters.length, type, `(complexity ${complexity})`);
    // console.log(`${waters.length} ${type} polygon (complexity ${complexity}) in ${Math.round(perf.stop(`poly-${type}`).time)}ms`);

    return waters;


}

function perfReport(entities, type, note='') {
    const time = perf.stop(`${type}`).time;
    const timeColor = time > 200 ? String(Math.round(time)).red : Math.round(time);
    console.log(`${entities} ${type} ${note} in ${timeColor}ms (${ entities ? Math.round(time / entities * 10)/10 + 'ms each' : '' })`);
} 

module.exports = function dataForBounds(bounds, zoom) {
    const WATERSCALE = 100;
    const waterPolys = turf.flatten(turf.featureCollection(makePolys(bounds, 
        WATERSCALE,
        'water2',  
        zoom - 5, 
        0.3, 
        0.45))).features;
    const towns = makeTowns(bounds, waterPolys);
    return {
        type: 'FeatureCollection',
        features: [
            ...towns,
            ...makeRoads(bounds, zoom, waterPolys), 
            ...makePolys(bounds, 100, 'forest',  zoom - 8, 0.5, 0.6), // complexity: 4
            ...makePolys(bounds, 100, 'forest2', zoom - 8, 0.3, 0.8),
            ...makePolys(bounds, WATERSCALE, 'water',    zoom - 6, 0.3, 0.5),
            ...waterPolys,
            ...makePolys(bounds, WATERSCALE, 'water3',   zoom - 8, 0.2, 0.5),


            // ...makePolys(bounds, 30, 'water4',   zoom - 8, 0.15, 0.5),
        ]
    };
}
