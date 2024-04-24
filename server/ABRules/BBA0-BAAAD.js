var BBA0Rule;

function BBA0RuleClass() {
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let DashMetrics = factory.getSingletonFactoryByName('DashMetrics');
    let Debug = factory.getSingletonFactoryByName('Debug');
    let context = this.context;
    let instance;

    const reservoir = 8;
    const cushion = 30;
    let ratePrev = 0;

    function setup() {
        let logger = Debug(context).getInstance().getLogger(instance);
    }

    function comp(propertyName) {
        return function (object1, object2) {
            var value1 = object1[propertyName];
            var value2 = object2[propertyName];
            return value1 - value2;
        };
    }

    function fun(currentBufferLevel, step, rateMap) {
        if (currentBufferLevel <= cushion + reservoir && currentBufferLevel >= reservoir)
            return rateMap[Math.round((currentBufferLevel - reservoir) / step) * step + reservoir];

        else if (currentBufferLevel > cushion + reservoir)
            return rateMap[cushion + reservoir];

        else
            return rateMap[reservoir];
    }

    function getMaxIndex(rulesContext) {
        const mediaInfo = rulesContext.getMediaInfo();
        const mediaType = rulesContext.getMediaInfo().type;
        let metricsModel = MetricsModel(context).getInstance();
        let metrics = metricsModel.getMetricsFor(mediaType, true);
        let switchRequest = SwitchRequest(context).create();
        const abrController = rulesContext.getAbrController();

        if (mediaType === 'video') {
            let bitrateList = abrController.getBitrateList(mediaInfo);
            bitrateList.sort(comp('bitrate'));
            let rateMap = {};
            let step = cushion / (bitrateList.length - 1);

            for (let i = 0; i < bitrateList.length; i++)
                rateMap[reservoir + i * step] = bitrateList[i].bitrate;
            
            let dashMetrics = DashMetrics(context).getInstance();
            let currentBufferLevel = dashMetrics.getCurrentBufferLevel('video');
            let rateNext = fun(currentBufferLevel, step, rateMap);

            switchRequest.quality = abrController.getQualityForBitrate(mediaInfo, rateNext / 1000, 0);
        } else {
            switchRequest.quality = 0;
        }

        return switchRequest;
    }

    function reset() {
        // no persistent information to reset
    }

    instance = {
        getMaxIndex: getMaxIndex,
        reset: reset
    };

    setup();

    return instance;
}

BBA0RuleClass.__dashjs_factory_name = 'BBA0Rule';
BBA0Rule = dashjs.FactoryMaker.getClassFactory(BBA0RuleClass);
