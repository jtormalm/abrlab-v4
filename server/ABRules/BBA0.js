/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

/*global dashjs*/

let BBA0Rule;

function BBA0RuleClass() {

    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let DashMetrics = factory.getSingletonFactoryByName('DashMetrics');
    let DashManifestModel = factory.getSingletonFactoryByName('DashManifestModel');
    let StreamController = factory.getSingletonFactoryByName('StreamController');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let Debug = factory.getSingletonFactoryByName('Debug');

    let context = this.context;
    let instance,
        logger;

    const reservoir = 8;
    const cushion = 30;
    let ratePrev = 0;

    function setup() {
        logger = Debug(context).getInstance().getLogger(instance);
    }

    function comp(propertyName) {
        return function (object1, object2) {
            var value1 = object1[propertyName];
            var value2 = object2[propertyName];
            return value1 - value2;
        };
    }

    function fun (currentBufferLevel, step, rateMap) {
        if (currentBufferLevel <= cushion + reservoir && currentBufferLevel >= reservoir)
            return rateMap[Math.round((currentBufferLevel - reservoir) / step) * step + reservoir];

        else if (currentBufferLevel > cushion + reservoir)
            return rateMap[cushion + reservoir];

        else
            return rateMap[reservoir];
    }


    function getMaxIndex(rulesContext) {
        // here you can get some informations aboit metrics for example, to implement the rule
        let metricsModel = MetricsModel(context).getInstance();
        let dashMetrics = DashMetrics(context).getInstance();
        let mediaInfo = rulesContext.getMediaInfo();
        var mediaType = rulesContext.getMediaInfo().type;
        var metrics = metricsModel.getMetricsFor(mediaType, true);
        let abrController = rulesContext.getAbrController();
        let switchRequest = SwitchRequest(context).create();

        if (mediaType === 'video') {
            let bitrateList = abrController.getBitrateList(mediaInfo);
            bitrateList.sort(comp('bitrate'));
            // console.log("bitrateList: " + JSON.stringify(bitrateList[0]));

            console.log("bitrateList:")
            bitrateList.map((b) => console.log(JSON.stringify(b)))

            let rateMap = {};
            let step = cushion / (bitrateList.length - 1);

            for (let i = 0; i < bitrateList.length; i++)
                rateMap[reservoir + i * step] = bitrateList[i].bitrate;

            let rateMax = bitrateList[bitrateList.length - 1].bitrate;
            let rateMin = bitrateList[0].bitrate;
            ratePrev = ratePrev > rateMin ? ratePrev : rateMin;
            let ratePlus = rateMax
            let rateMinus = rateMin;

            if (ratePrev === rateMax) {
                ratePlus = rateMax;
            } else {
                for (let i = 0; i < bitrateList.length; i++) {
                    if (bitrateList[i].bitrate > ratePrev) {
                        ratePlus = bitrateList[i].bitrate;
                        break;
                    }
                }
            }

            if (ratePrev === rateMin) {
                rateMinus = rateMin;
            } else {
                for (let i = bitrateList.length - 1; i >= 0; i--) {
                    if (bitrateList[i].bitrate < ratePrev) {
                        rateMinus = bitrateList[i].bitrate;
                        break;
                    }
                }
            }

            let currentBufferLevel = dashMetrics.getCurrentBufferLevel('video');
            let fCurrentBufferLevel = fun(currentBufferLevel, step, rateMap);

            let rateNext;
            if (currentBufferLevel <= reservoir) {
                rateNext = rateMin;
            } else if (currentBufferLevel >= cushion + reservoir) {
                rateNext = rateMax;
            }
            else if (fCurrentBufferLevel >= ratePlus) {
                for (let i = bitrateList.length - 1; i >= 0; i--) {
                    if (bitrateList[i].bitrate <= fCurrentBufferLevel) {
                        rateNext = bitrateList[i].bitrate;
                        break;
                    }
                }
            } else {
                rateNext = ratePrev
            }

            ratePrev = rateNext;

            switchRequest.quality = abrController.getQualityForBitrate(mediaInfo, rateNext / 1000, 0);
            console.log("BBA-0 RULE: Setting quality to " + switchRequest.quality + " for video media type")
        } else {
            switchRequest.quality = 0;
        }

        switchRequest.priority = SwitchRequest.PRIORITY.STRONG;
        return switchRequest;
    }

    instance = {
        getMaxIndex: getMaxIndex
    };

    setup();

    return instance;
}

BBA0RuleClass.__dashjs_factory_name = 'BBA0Rule';
BBA0Rule = dashjs.FactoryMaker.getClassFactory(BBA0RuleClass);