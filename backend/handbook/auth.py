from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class NimbusTokenSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["is_admin"] = user.is_staff  # baked into the token, so FastAPI can read it later
        token["email"] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["is_admin"] = self.user.is_staff  # also sent in the response, so React can show/hide admin links
        data["email"] = self.user.email
        return data


class NimbusTokenView(TokenObtainPairView):
    serializer_class = NimbusTokenSerializer