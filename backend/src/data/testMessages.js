/**
 * テスト用 Chatwork メッセージデータ
 *
 * 実際のチャットワーク API / GAS収集で取得されるデータ形式を模したもの。
 * Chatwork API の GET /rooms/{room_id}/messages レスポンスに準拠。
 *
 * サンプル記録: medicanvas/Chatwork/ のAさん〜Dさんの日中・夜間記録を
 * チャットワーク投稿形式に変換したもの。
 */

const TEST_ROOMS = {
  // 実ルーム: 田中さん（テスト）— Chatwork room_id: 429340132
  'room_tanaka_real': {
    room_id: '429340132',
    room_name: '田中さん（テスト）',
    patient_name: '田中さん',
    patient_type: '知的・軽度、就労支援B型（テスト）'
  },
  // Aさん（田中さん）のルーム
  'room_A_tanaka': {
    room_id: '100001',
    room_name: '【日中・夜間】Aさん（田中）',
    patient_name: '田中さん',
    patient_type: '知的・軽度、就労支援B型'
  },
  // Bさん（佐藤さん）のルーム
  'room_B_sato': {
    room_id: '100002',
    room_name: '【日中・夜間】Bさん（佐藤）',
    patient_name: '佐藤さん',
    patient_type: '知的・重度、てんかん、全介助、便秘体質'
  },
  // Cさん（伊藤さん）のルーム
  'room_C_ito': {
    room_id: '100003',
    room_name: '【日中・夜間】Cさん（伊藤）',
    patient_name: '伊藤さん',
    patient_type: '統合失調症、幻聴・こだわり'
  },
  // Dさん（鈴木さん）のルーム
  'room_D_suzuki': {
    room_id: '100004',
    room_name: '【日中・夜間】Dさん（鈴木）',
    patient_name: '鈴木さん',
    patient_type: '知的・中等度、こだわり・他害・自傷リスク'
  }
};

// Aさんの日中記録（加藤スタイル: 短文・事実重視）
const MESSAGES_A_DAY_KATO = [
  {
    message_id: 'A001',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【06:30】起床。バイタル正常。顔色良好。昨夜の睡眠十分。',
    send_time: Math.floor(new Date('2026-03-28T06:30:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A002',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【07:15】朝食全量摂取。食後の服薬（定期薬）確認。自室の整理整頓、自発的に実施。',
    send_time: Math.floor(new Date('2026-03-28T07:15:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A003',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【08:10】出勤準備。青スニーカー泥付着。本人「汚い」と拒絶あり。',
    send_time: Math.floor(new Date('2026-03-28T08:10:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A004',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【08:20】代替の黒スニーカー提案。当初5分ほど「これじゃない」と発声し拒否。「帰宅後に一緒に洗う」旨を提案し、本人が納得。自傷・他害なく切り替え。',
    send_time: Math.floor(new Date('2026-03-28T08:20:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A005',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【11:30】作業所中間報告。袋詰め作業、手順変更あるも混乱なし。作業ペース安定。',
    send_time: Math.floor(new Date('2026-03-28T11:30:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A006',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【15:50】帰宅。検温：36.8度。少しぼーっとしている。水分150ml提供。',
    send_time: Math.floor(new Date('2026-03-28T15:50:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A007',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【16:45】★要対応：急変・不穏。緊急報告。検温38.4度。右耳を何度も触り、「痛い、痛い」と大声。右耳周囲に発赤あり。痛みによる不穏。自分の頭を叩く自傷行為が断続的に発生。アイスノンで冷却試みるも拒絶。',
    send_time: Math.floor(new Date('2026-03-28T16:45:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A008',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【17:10】★要対応：指示仰ぎ。管理者へ連絡済。受診の要否確認。本人、痛みでパニック継続。自室にて1対1で見守り中。他利用者への影響なし。',
    send_time: Math.floor(new Date('2026-03-28T17:10:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A009',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【17:45】管理者指示により頓服（アセトアミノフェン）服用。服用15分後、発声治まり、ベッドで横になる。',
    send_time: Math.floor(new Date('2026-03-28T17:45:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A010',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【18:30】夕食。痛みのためか食欲減退。3割摂取。水分補給（ポカリスエット）200ml。熱は37.9度に微減。自傷は停止。',
    send_time: Math.floor(new Date('2026-03-28T18:30:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A011',
    account: { account_id: '201', name: 'スタッフ加藤' },
    body: '【19:45】入床。安静。夜勤へ申し送り：深夜帯の再発熱と、中耳炎の可能性について経過観察指示。',
    send_time: Math.floor(new Date('2026-03-28T19:45:00+09:00').getTime() / 1000),
    update_time: 0
  },
  // 業務連絡（ノイズ）
  {
    message_id: 'A_NOISE_01',
    account: { account_id: '205', name: '管理者吉村' },
    body: '来週月曜のシフト表、メール送りましたのでご確認ください。変更ある方は金曜までに連絡お願いします。',
    send_time: Math.floor(new Date('2026-03-28T12:00:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'A_NOISE_02',
    account: { account_id: '203', name: 'スタッフ山本' },
    body: 'お疲れ様です！洗剤がなくなりそうなので、明日買ってきますね〜',
    send_time: Math.floor(new Date('2026-03-28T14:30:00+09:00').getTime() / 1000),
    update_time: 0
  }
];

// Bさんの日中記録（高橋スタイル: 実務重視、箇条書き混在）
const MESSAGES_B_DAY_TAKAHASHI = [
  {
    message_id: 'B001',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【07:30】起床・バイタル・更衣\nBさん起床。今朝は少し顔色が白っぽい。室温22度。バイタル：BP108/65、P72、T36.2。サチュレーション97％で安定。オムツ交換時、尿量多めだが便は今日もなし（5日目）。下腹部かなり張ってる。',
    send_time: Math.floor(new Date('2026-03-28T07:30:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'B002',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【08:20】朝食（潰し食）・服薬\n朝食介助。一口目、嚥下反射が遅い。二口目で激しくむせ込みあり。吸引機準備したが自力で排出。その後はとろみを一段階強くして対応。全量摂取。食後のてんかん薬、白湯に溶かして服用済。',
    send_time: Math.floor(new Date('2026-03-28T08:20:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'B003',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【10:15】発作確認・活動\n室内で音楽療法中。10:12から45秒間、右上方を凝視して静止。欠神発作と思われる。体幹の揺れはないが、呼びかけに反応なし。タイマーで計測。1分後には視線が戻り、少しボーッとした後、ニコッと笑う。',
    send_time: Math.floor(new Date('2026-03-28T10:15:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'B004',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【12:45】★昼食・噴出性嘔吐（重要）\n昼食。本人の食欲もあり、スムーズに半分ほど摂取。ところが12:55頃、突如として胃の内容物をすべて噴出するように嘔吐。未消化物（朝の分？）が混ざっている。便秘が続いてて胃腸が動いてないっぽい。すぐに顔を横に向けて誤嚥防止。口腔ケア実施。着替えとシーツ交換。本人はかなり体力消耗、顔色が土気色に。横にして休ませる。',
    send_time: Math.floor(new Date('2026-03-28T12:55:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'B005',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【14:30】水分・栄養補給\n昼食を戻してしまったので脱水と低血糖が心配。ザバス（プロテイン飲料）を吸い飲みで少しずつ、20分かけて150ml提供。これは嘔吐せず、ゆっくり嚥下できている。飲み終わる頃には目に力が戻ってきた。',
    send_time: Math.floor(new Date('2026-03-28T14:30:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'B006',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【16:10】★排便（大量）・腹部状態\nやっと出た。おむつ交換時に多量の硬便を確認。自力で。かなりの量。便が出た後、Bさんの表情が明らかに楽そうになる。お腹の張りもかなり軽減。嘔吐はやっぱり出口が詰まってて上が押し戻された感じ。',
    send_time: Math.floor(new Date('2026-03-28T16:10:00+09:00').getTime() / 1000),
    update_time: 0
  },
  {
    message_id: 'B007',
    account: { account_id: '204', name: 'スタッフ高橋' },
    body: '【18:50】夕食・夜間申し送り\n夕食。昼の件があるので、さらに細かくミキサーにかけたものを少量（6割程度）に。ゆっくり時間をかけて全量摂取。むせ込みなし。薬も服用。\n夜勤さんへ：今日は「発作1回」「昼食全戻し」「大量排便」とイベント多いです。夜中にまたお腹が動いて気持ち悪くなるかもしれないので、体位変換の時に顔色チェックお願いします。枕元に吸引機置いてあります。',
    send_time: Math.floor(new Date('2026-03-28T18:50:00+09:00').getTime() / 1000),
    update_time: 0
  }
];

module.exports = {
  TEST_ROOMS,
  MESSAGES_A_DAY_KATO,
  MESSAGES_B_DAY_TAKAHASHI,
  // 全テストメッセージをルーム別にまとめたもの
  getTestMessagesByRoom(roomId) {
    switch (roomId) {
      case '429340132': return MESSAGES_A_DAY_KATO; // 実Chatworkルーム（テスト用にAさんデータを使用）
      case '100001': return MESSAGES_A_DAY_KATO;
      case '100002': return MESSAGES_B_DAY_TAKAHASHI;
      default: return [];
    }
  },
  getAllTestRooms() {
    return Object.values(TEST_ROOMS);
  }
};
