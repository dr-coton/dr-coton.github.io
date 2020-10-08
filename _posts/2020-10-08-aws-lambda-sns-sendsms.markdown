---
layout: post
title:  AWS Lambda 와 AWS SNS 로 문자 서비스 API 만들기
author: teddy
categories: [ aws, nodejs, serverless ]
date:   2020-10-08 14:00:00 +0900
image:  assets/images/02/0.png
featured: true
---

AWS 제품 중 서버리스 제품인 Lambda와 간단 알림 서비스 (Simple Notification Service) SNS를 이용하여 간단하게 문자 메시지 API 만드는 방법을 소개합니다. 

문자 메시지 API의 경우에는 서비스를 만들면서 종종 사용하게 되는데, 간단한 MVP 버전의 서비스를 만들거나 개인 프로젝트의 경우에 문자 서비스를 사용하려면 작은 문제점이 하나씩 생기기 때문에 저는 AWS를 통해 간단하게 API를 만들어서 사용하고 있습니다. 

AWS Lambda의 경우에는 1백만건 까지 무료로 제공하고 있어 비용이 발생하지 않으며, SNS의 경우에는 문자 서비스 비용만 (프리티어 100건 무료 이후 건당 $0.00645, 약 7원) 차감되는 구조입니다. 따라서 서버 유지 비용이나 기타 관리비가 들지 않아 자주 사용하는 방식입니다. 

(AWS Lambda에 대한 자세한 가격은 [https://aws.amazon.com/ko/lambda/pricing/](https://aws.amazon.com/ko/lambda/pricing/) 을 참고하세요.)

(실습 예상 시간 : 5 ~ 10분) 

> 참고 : 사전에 AWS 계정을 가지고 계시고 기본적인 AWS 용어는 알고 있다는 가정에서 실습을 진행합니다. 궁금한 점이 있으시면 댓글로 문의주시면 답변드릴 수 있도록 하겠습니다.

<br>

---

## SPEC
API를 만들기 전에 스펙을 잠시 살펴보자면, AWS Lambda에 올릴 코드는 node.js 기반으로 제작을 하게 됩니다. API는 아래와 같이 보낼려고 합니다. 
```json
Request Body 

{
"phone":"+821028432671",
"code":"102938"
}
```

위와 같이 간단하게 번호와 코드를 보내주면, 문자를 보내주는 시스템입니다.

<br>

---

## 1단계 : AWS IAM 설정 
AWS SNS에서의 SMS 보내는 것은 AWS문서 SNS Supported Regions Countries에 따르면 한국은 지원하고 있지 않습니다.

![]({{ site.baseurl }}/assets/images/02/1.png)

하지만 SMS 전송은 South Korea에 가능하다고 나와있기 때문에 오늘 예제에서는 도쿄 리전에서 문자를 보내는 것을 해볼 예정입니다. 

해외 번호로 문자를 보내는 것이기 때문에, 실제 국내 서비스의 프로덕션 레벨에서는 한국 내 다른 문자 서비스를 활용하는 것이 좋습니다.

<br>

### IAM 설정 
AWS Lambda가 AWS SNS에 접근하여 문자를 보내려면 사이에 권한이 필요합니다. IAM 역할을 통해 아주 간단하게 생성을 할 수 있습니다. 

##### 1. IAM에 접속하여 "역할 만들기" 선택

![]({{ site.baseurl }}/assets/images/02/2.png)

##### 2. 사용 사례 선택에서 "Lambda" 선택 후 다음 진행 

![]({{ site.baseurl }}/assets/images/02/3.png)

##### 3. "SNS"를 검색하여, "AmazonSNSFullAccess" 선택 후 다음 선택 후 태그 페이지에서도 다음

![]({{ site.baseurl }}/assets/images/02/4.png)

##### 4. 역할 이름에 "role_send_sms"라 입력하고 역할 만들기 진행

![]({{ site.baseurl }}/assets/images/02/5.png)

IAM 설정은 마무리 했습니다. 이제 람다에서 SNS 접근 권한이 생겨 문자를 보낼 수 있습니다. 

<br>

---

## 2단계 : AWS Lambda 설정 

이제 AWS Lambda를 통해 문자를 보내겠습니다.

##### 1. 람다에 접속해서 "함수" 선택 후 "함수 생성"을 눌러주세요.

![]({{ site.baseurl }}/assets/images/02/6.png)

##### 2. 함수 이름은 "sendSMSExample"로 해주시고, 런타임은 "Node.js 12.x"로 설정 해주세요. 

![]({{ site.baseurl }}/assets/images/02/7.png)

##### 3. "기본 실행 역할 변경"에서 "기존 역할 사용"을 선택하고, "role_send_sms"을 선택 해주세요.

![]({{ site.baseurl }}/assets/images/02/8.png)

##### 4. 함수 입력 창에 아래 코드를 복사 붙여넣기 해주세요. 

```js
// AWS SDK를 불러옵니다. 
const AWS = require('aws-sdk');

// AWS 기본 설정에서 리전을 도쿄리전으로 설정합니다. 
AWS.config.update({region: 'ap-northeast-1'});

// 실제 동작하는 함수입니다. 
exports.handler = (event, context, callback) => {
    
    // 요청 바디에서 값을 가지고 옵니다. 
    const phonenumber = event.phone;
	const code = event.code; 

    // 문자 보내는 파라미터 객체를 생성합니다. 
    var params = {
        Message: '본인확인 인증번호 [' + code + ']를 화면에 입력해주세요',
        PhoneNumber: phonenumber
    };

    // AWS SNS Promise 를 생성합니다.
	const smsRunPromise= new AWS.SNS().publish(params).promise();
	
	smsRunPromise.then(
        function(data) {
            // 성공하는 경우 보낸 메세지 아이디를 반환합니다. 
            callback(null,"MessageID is " + data.MessageId);
        }).catch(
        function(err) {
            // 실패하는 경우 에러를 반환합니다. 
            callback(err);
    });
};
```

코드를 복사하시면 아래 사진과 같이 되었을 겁니다. 

![]({{ site.baseurl }}/assets/images/02/9.png)

##### 5. 테스트를 할 수 있도록 상단에 "테스트 이벤트 선택"에서 "테스트 이벤트 구성"을 선택하세요. 

![]({{ site.baseurl }}/assets/images/02/10.png)

##### 6. 이벤트 이름은 아무렇게 입력하시고, 아래 "JSON 데이터"를 "자신의 핸드폰 번호"로 바꾸어 작성해줍니다. 

```JSON
{
	"phone":"+821012345678",
	"code":"102938"
}
```

![]({{ site.baseurl }}/assets/images/02/10.png)

##### 7. "테스트" 버튼을 누르면 아래와 같이 성공하고 문자 메시지가 왔는지 확인 해보세요.

![]({{ site.baseurl }}/assets/images/02/11.png)

![]({{ site.baseurl }}/assets/images/02/12.png)

<br>

이렇게 AWS 기능 2개를 이용하여 문자 보내는 API를 만들어 보았습니다. 

실제로 +82 이렇게 API를 사용할 수 없는 환경이라면 npm 에서 awesome-phonenumber를 검색하여 사용해보시길 바랍니다. 

저는 awesome-phonenumber 오픈소스를 활용하여 01012345678 형식으로 호출하여도 문자가 발송할 수 있게 사용 중에 있습니다. 

아래 코드가 실제 제가 사용하는 코드 일부를 가져왔습니다.

```js
... (중략)

import PhoneNumber from 'awesome-phonenumber';

... (중략)

const pn = new PhoneNumber(phone,'KR');
console.log(pn.getNumber('e164'));

const params = {
    Message: '본인확인 인증번호 [' + code + ']를 화면에 입력해주세요',
    PhoneNumber: "" + pn.getNumber('e164')
};

... (중략)
```

이렇게 사용하는 경우 01012345678 로 보내면 +821012345678 로 변환해서 보내게 됩니다. 

간단하게 AWS를 이용하여 문자보내는 API를 만들어 보았습니다. 

AWS를 활용한 간단한 도구 만들기를 앞으로도 종종 만들어 보겠습니다.

감사합니다.  

<br>

---

## References

1. Amazon SNS를 통한 SMS 메시지 전송, AWS ([https://docs.aws.amazon.com/ko_kr/sdk-for-javascript/v2/developer-guide/sns-examples-sending-sms.html](https://docs.aws.amazon.com/ko_kr/sdk-for-javascript/v2/developer-guide/sns-examples-sending-sms.html))
2. AWS Lambda 요금, AWS ([https://aws.amazon.com/ko/lambda/pricing/](https://aws.amazon.com/ko/lambda/pricing/))