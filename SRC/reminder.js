/**
 * Time Tracker - 提醒系统
 * 负责定时提醒功能
 */

const ReminderSystem = (function() {
    // 状态
    let reminderTimer = null;
    let reminderCount = 0;
    let currentSettings = null;
    let isExcludedTag = false;

    // 特殊标签（休闲/娱乐）的鼓励骚话库
    const EXCLUDED_MESSAGES = {
        gentle: [
            "🎮 人类，该收收心了~",
            "🌟 休息够了吗？钢铁意志在召唤！",
            "⚡ 适度娱乐益脑，过度摸鱼伤肝~",
            "🎯 目标还在等着你呢，勇者！",
            "🔥 你的潜力比你想象的更强大！",
            "💪 起来动一动，继续征服世界！",
            "🚀 休息是为了更好地出发~"
        ],
        moderate: [
            "⚠️ 人类！请磨练钢铁的意志，继续完成挑战自制力的任务吧！你可以的！",
            "🦾 喂！已经休息很久了！是时候展现真正的技术了！",
            "💥 醒醒！你的梦想不会自己实现的！",
            "🏃 动起来动起来！别让懒惰打败你！",
            "⏰ 时间在流逝，机会在溜走，抓紧啊！"
        ],
        intense: [
            "🚨 警报！警报！休息时间严重超标！",
            "😱 再不行动，今天就废了！快快快！",
            "💀 你确定要在沙发上躺成咸鱼吗？！",
            "🔔 紧急集合！生产力部队请立刻归队！",
            "⚡ 最后通牒！5秒内开始工作！5...4...3..."
        ]
    };

    // 普通标签（工作/学习）的休息提醒骚话库
    const NORMAL_MESSAGES = [
        "🧘 快点用你高贵的头颅写个'粪'，颈椎要折了啦！再喝口水支援粑粑的艰难排出任务！",
        "☕ 辛苦啦！起来伸个懒腰，喝杯水，让眼睛休息一下~",
        "🌈 你已经专注很久了，真棒！该给大脑放个风了~",
        "🎈 工作狂魔请注意：你的眼睛和腰椎正在发出求救信号！",
        "🍵 来杯茶歇一下？久坐伤身，动一动才能活更久~",
        "👀 眼睛干了吧？看看远处，做做眼保健操~",
        "🦴 骨头咔咔响了没？站起来扭扭腰！",
        "💧 别忘了喝水！人体70%是水，别把自己喝成人干~",
        "🌿 深呼吸，看看窗外，给大脑充个氧~",
        "🎵 休息一下，听首歌，待会儿效率更高哦~"
    ];

    // 语音提示（使用 Web Speech API）
    function speak(text) {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'zh-CN';
            utterance.rate = 0.9;
            utterance.pitch = 1.1;
            speechSynthesis.speak(utterance);
        }
    }

    // 播放提示音
    function playSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 523.25;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;
            
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            oscillator.stop(audioContext.currentTime + 0.5);
            
            setTimeout(() => {
                const osc2 = audioContext.createOscillator();
                const gain2 = audioContext.createGain();
                osc2.connect(gain2);
                gain2.connect(audioContext.destination);
                osc2.frequency.value = 659.25;
                osc2.type = 'sine';
                gain2.gain.value = 0.3;
                osc2.start();
                gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                osc2.stop(audioContext.currentTime + 0.5);
            }, 200);
            
        } catch (e) {
            console.log('无法播放提示音:', e);
        }
    }

    // 显示通知
    function showNotification(title, body, isExcluded) {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                new Notification(title, {
                    body: body,
                    icon: isExcluded ? '🎮' : '☕',
                    tag: 'time-tracker-reminder',
                    requireInteraction: true
                });
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(title, { body: body });
                    }
                });
            }
        }
    }

    // 获取随机消息
    function getRandomMessage(messages) {
        return messages[Math.floor(Math.random() * messages.length)];
    }

    // 获取设置（从 DataManager）
    function getSettings() {
        if (typeof DataManager !== 'undefined' && DataManager.getReminderSettings) {
            return DataManager.getReminderSettings();
        }
        return {
            normalInterval: 90,
            normalMessageMode: 'random',
            normalCustomMessage: '',
            excludedInterval: 30,
            excludedMessageMode: 'random',
            excludedCustomMessage: ''
        };
    }

    // 触发提醒
    function triggerReminder(isExcluded, count, settings) {
        let message;
        let title;

        if (isExcluded) {
            // 特殊标签提醒
            title = count === 1 ? '🎮 休息提醒' : 
                    count === 2 ? '⚠️ 再次提醒' : 
                    '🚨 紧急提醒！';
            
            if (settings.excludedMessageMode === 'custom' && settings.excludedCustomMessage) {
                message = settings.excludedCustomMessage;
            } else {
                // 随机骚话，根据次数加重语气
                if (count === 1) {
                    message = getRandomMessage(EXCLUDED_MESSAGES.gentle);
                } else if (count === 2) {
                    message = getRandomMessage(EXCLUDED_MESSAGES.moderate);
                } else {
                    message = getRandomMessage(EXCLUDED_MESSAGES.intense);
                }
            }
        } else {
            // 普通标签休息提醒
            title = '☕ 休息时间到！';
            
            if (settings.normalMessageMode === 'custom' && settings.normalCustomMessage) {
                message = settings.normalCustomMessage;
            } else {
                message = getRandomMessage(NORMAL_MESSAGES);
            }
        }

        // 播放提示音
        playSound();

        // 显示通知
        showNotification(title, message, isExcluded);

        // 语音播报（移除所有 emoji 用于语音）
        const speakText = message
            .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')  // 表情符号
            .replace(/[\u{2600}-\u{26FF}]/gu, '')    // 杂项符号 (⚡☕🌟等)
            .replace(/[\u{2700}-\u{27BF}]/gu, '')    // 装饰符号
            .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '')  // 扩展符号
            .replace(/[\u{231A}-\u{23FF}]/gu, '')    // 技术符号
            .replace(/[\u{2300}-\u{23FF}]/gu, '')    // 其他技术符号
            .replace(/[\u{2B50}]/gu, '')             // 星星
            .replace(/[\u{1F600}-\u{1F64F}]/gu, '')  // 表情
            .trim();
        speak(speakText);

        console.log(`[提醒系统] 🔔 ${title}: ${message}`);
    }

    // 安排下一次提醒
    function scheduleNextReminder() {
        if (!currentSettings) return;
        
        const interval = isExcludedTag 
            ? currentSettings.excludedInterval * 60 * 1000 
            : currentSettings.normalInterval * 60 * 1000;
        
        console.log(`[提醒系统] ⏰ 已安排下次提醒，${isExcludedTag ? currentSettings.excludedInterval : currentSettings.normalInterval} 分钟后`);
        
        reminderTimer = setTimeout(() => {
            reminderCount++;
            triggerReminder(isExcludedTag, reminderCount, currentSettings);
            // 继续安排下一次
            scheduleNextReminder();
        }, interval);
    }

    // 开始提醒（计时开始时调用）
    function start(selectedTags, getTags) {
        // 先重置
        reset();
        
        const tags = getTags();
        const settings = getSettings();
        currentSettings = settings;
        
        // 检查是否有特殊标签
        isExcludedTag = selectedTags.some(tagId => {
            const tag = tags.find(t => t.id === tagId);
            return tag && tag.isExcluded;
        });

        const interval = isExcludedTag ? settings.excludedInterval : settings.normalInterval;
        console.log(`[提醒系统] ✅ 已启动，类型: ${isExcludedTag ? '特殊标签' : '普通标签'}，间隔: ${interval} 分钟`);
        
        // 安排第一次提醒
        scheduleNextReminder();
    }

    // 重置提醒状态
    function reset() {
        if (reminderTimer) {
            clearTimeout(reminderTimer);
            reminderTimer = null;
        }
        reminderCount = 0;
        currentSettings = null;
        isExcludedTag = false;
        console.log('[提醒系统] 🔄 已重置');
    }

    // 请求通知权限
    function requestPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // 公开接口
    return {
        start,
        reset,
        requestPermission,
        testExcludedReminder: () => triggerReminder(true, 1, getSettings()),
        testNormalReminder: () => triggerReminder(false, 1, getSettings())
    };
})();
