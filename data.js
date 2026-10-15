// 전체 단어장 (앞으로 여기에 100개, 1000개 계속 추가하시면 됩니다)
const VOCAB_LIST = [
  // PART 1. 일상 루틴
  { kr: '늦잠 자다', cn: '睡过头', py: 'shuì guò tóu' },
  { kr: '잠이 깨다', cn: '睡醒', py: 'shuì xǐng' },
  { kr: '씻고 나오다', cn: '洗完出来', py: 'xǐ wán chūlái' },
  { kr: '준비하다', cn: '做准备', py: 'zuò zhǔnbèi' },
  { kr: '허둥지둥하다', cn: '手忙脚乱', py: 'shǒu máng jiǎo luàn' },
  { kr: '정신이 없다', cn: '忙得不可开交', py: 'máng de bù kě kāi jiāo' },
  { kr: '시간 맞추다', cn: '赶时间', py: 'gǎn shíjiān' },
  { kr: '외출하다', cn: '出门', py: 'chūmén' },
  { kr: '집에 가다', cn: '回家', py: 'huí jiā' },
  { kr: '쉬다', cn: '休息', py: 'xiūxi' },

  // PART 2. 이동 & 교통
  { kr: '길 막히다', cn: '堵车', py: 'dǔchē' },
  { kr: '환승하다', cn: '换乘', py: 'huànchéng' },
  { kr: '지각하다', cn: '迟到', py: 'chídào' },
  { kr: '길 헤매다', cn: '迷路', py: 'mílù' },
  { kr: '택시 잡다', cn: '打车', py: 'dǎchē' },
  { kr: '길을 돌아가다', cn: '绕路', py: 'ràolù' },
  { kr: '막차 놓치다', cn: '错过末班车', py: 'cuòguò mòbānchē' },
  { kr: '길 안내하다', cn: '指路', py: 'zhǐlù' },
  { kr: '서두르다', cn: '快点走', py: 'kuài diǎn zǒu' },
  { kr: '내리다', cn: '下车', py: 'xiàchē' },

  // PART 3. 음식 & 식당
  { kr: '배고프다', cn: '饿了', py: 'è le' },
  { kr: '배부르다', cn: '吃饱了', py: 'chī bǎo le' },
  { kr: '입맛에 맞다', cn: '合口味', py: 'hé kǒuwèi' },
  { kr: '주문하다', cn: '点菜', py: 'diǎn cài' },
  { kr: '포장하다', cn: '打包', py: 'dǎbāo' },
  { kr: '줄 서다', cn: '排队', py: 'páiduì' },
  { kr: '맛있게 먹다', cn: '吃得很香', py: 'chī de hěn xiāng' },
  { kr: '맵다', cn: '很辣', py: 'hěn là' },
  { kr: '달다', cn: '很甜', py: 'hěn tián' },
  { kr: '계산하다', cn: '结账', py: 'jiézhàng' },

  // PART 4. 학교 & 공부
  { kr: '수업 듣다', cn: '上课', py: 'shàngkè' },
  { kr: '발표하다', cn: '做报告', py: 'zuò bàogào' },
  { kr: '복습하다', cn: '复习', py: 'fùxí' },
  { kr: '예습하다', cn: '预习', py: 'yùxí' },
  { kr: '시험 보다', cn: '考试', py: 'kǎoshì' },
  { kr: '시험 망치다', cn: '考砸了', py: 'kǎo zá le' },
  { kr: '과제 내다', cn: '交作业', py: 'jiāo zuòyè' },
  { kr: '벼락치기하다', cn: '临时抱佛脚', py: 'línshí bào fójiǎo' },
  { kr: '집중하다', cn: '集中注意力', py: 'jízhōng zhùyìlì' },
  { kr: '졸업하다', cn: '毕业', py: 'bìyè' },

  // PART 5. 회사 & 업무
  { kr: '출근하다', cn: '上班', py: 'shàngbān' },
  { kr: '퇴근하다', cn: '下班', py: 'xiàbān' },
  { kr: '야근하다', cn: '加班', py: 'jiābān' },
  { kr: '회의하다', cn: '开会', py: 'kāihuì' },
  { kr: '보고하다', cn: '汇报', py: 'huìbào' },
  { kr: '업무를 처리하다', cn: '处理工作', py: 'chǔlǐ gōngzuò' },
  { kr: '마감 맞추다', cn: '赶截止日期', py: 'gǎn jiézhǐ rìqī' },
  { kr: '눈치 보다', cn: '看别人脸色', py: 'kàn biérén liǎnsè' },
  { kr: '월급 받다', cn: '发工资', py: 'fā gōngzī' },
  { kr: '연봉 협상하다', cn: '谈年薪', py: 'tán niánxīn' },

  // PART 6. 인간관계

  { kr: '친해지다', cn: '变熟', py: 'biàn shú' },
  { kr: '어색하다', cn: '很尴尬', py: 'hěn gāngà' },
  { kr: '거리감 느끼다', cn: '感觉有距离感', py: 'gǎnjué yǒu jùlígǎn' },
  { kr: '서운하다', cn: '有点失落', py: 'yǒudiǎn shīluò' },
  { kr: '맞춰 주다', cn: '迁就', py: 'qiānjiù' },
  { kr: '무시하다', cn: '无视', py: 'wúshì' },
  { kr: '오해하다', cn: '误会', py: 'wùhuì' },
  { kr: '화해하다', cn: '和好', py: 'héhǎo' },
  { kr: '말 돌리다', cn: '转移话题', py: 'zhuǎnyí huàtí' },
  { kr: '분위기 깨다', cn: '破坏气氛', py: 'pòhuài qìfēn' },

  // PART 7. 감정 표현

  { kr: '짜증 나다', cn: '很烦', py: 'hěn fán' },
  { kr: '부담스럽다', cn: '有压力', py: 'yǒu yālì' },
  { kr: '긴장되다', cn: '紧张', py: 'jǐnzhāng' },
  { kr: '안심하다', cn: '放心', py: 'fàngxīn' },
  { kr: '감동받다', cn: '很感动', py: 'hěn gǎndòng' },
  { kr: '울컥하다', cn: '一下子很感动', py: 'yíxiàzi hěn gǎndòng' },
  { kr: '후회하다', cn: '后悔', py: 'hòuhuǐ' },
  { kr: '민망하다', cn: '很不好意思', py: 'hěn bù hǎoyìsi' },
  { kr: '스트레스 받다', cn: '压力很大', py: 'yālì hěn dà' },
  { kr: '기분이 풀리다', cn: '心情变好了', py: 'xīnqíng biàn hǎo le' },

  // PART 8. 연애 & 썸

  { kr: '썸 타다', cn: '搞暧昧', py: 'gǎo àimèi' },
  { kr: '고백하다', cn: '表白', py: 'biǎobái' },
  { kr: '연락하다', cn: '联系', py: 'liánxì' },
  { kr: '읽씹하다', cn: '已读不回', py: 'yǐ dú bù huí' },
  { kr: '차이다', cn: '被甩', py: 'bèi shuǎi' },
  { kr: '헤어지다', cn: '分手', py: 'fēnshǒu' },
  { kr: '질투하다', cn: '吃醋', py: 'chīcù' },
  { kr: '설레다', cn: '心动', py: 'xīndòng' },
  { kr: '데이트하다', cn: '约会', py: 'yuēhuì' },
  { kr: '마음이 식다', cn: '感情淡了', py: 'gǎnqíng dàn le' },

  // PART 9. SNS & 스마트폰

  { kr: '사진 찍다', cn: '拍照片', py: 'pāi zhàopiàn' },
  { kr: '셀카 찍다', cn: '自拍', py: 'zìpāi' },
  { kr: '댓글 달다', cn: '留评论', py: 'liú pínglùn' },
  { kr: '좋아요 누르다', cn: '点赞', py: 'diǎn zàn' },
  { kr: '공유하다', cn: '分享', py: 'fēnxiǎng' },
  { kr: '중독되다', cn: '上瘾', py: 'shàngyǐn' },
  { kr: '알림 뜨다', cn: '弹出通知', py: 'tánchū tōngzhī' },
  { kr: '검색하다', cn: '搜索', py: 'sōusuǒ' },
  { kr: '저장하다', cn: '保存', py: 'bǎocún' },
  { kr: '삭제하다', cn: '删除', py: 'shānchú' },

  // Part 10. 취미 & 여가
  { kr: '운동하다', cn: '运动', py: 'yùndòng' },
  { kr: '산책하다', cn: '散步', py: 'sànbù' },
  { kr: '영화 보다', cn: '看电影', py: 'kàn diànyǐng' },
  { kr: '게임하다', cn: '打游戏', py: 'dǎ yóuxì' },
  { kr: '정주행하다', cn: '一口气看完', py: 'yìkǒuqì kàn wán' },
  { kr: '빈둥거리다', cn: '无所事事', py: 'wúsuǒ shìshì' },
  { kr: '놀러 가다', cn: '去玩', py: 'qù wán' },
  { kr: '쉬러 가다', cn: '去放松', py: 'qù fàngsōng' },
  { kr: '스트레스 풀다', cn: '缓解压力', py: 'huǎnjiě yālì' },
  { kr: '집콕하다', cn: '宅在家里', py: 'zhái zài jiālǐ' },
];
